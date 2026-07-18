import fs from 'node:fs/promises';
import path from 'node:path';
import {
	findGoogleFontLinks,
	localFontLinkTag,
	stripGoogleFontPreconnects,
} from '../shared/font-localize.js';

export interface FontBuildContext {
	outAssetsDir: string;
	publicPrefix: string;
	/** Maps each decoded Google Fonts href to its localized `/_assets/fonts/…` asset (or `null`
	 * when the download failed). Persisted to the manifest via `collectFontMap` so the runtime SSR
	 * path can apply the same rewrite. */
	cache: Map<string, Promise<string | null>>;
	written: number;
}

export function createFontBuildContext(outAssetsDir: string): FontBuildContext {
	return {
		outAssetsDir,
		publicPrefix: '/_assets/fonts',
		cache: new Map(),
		written: 0,
	};
}

export async function localizeGoogleFontsInHtml(
	html: string,
	ctx: FontBuildContext,
): Promise<string> {
	let out = stripGoogleFontPreconnects(html);
	const links = findGoogleFontLinks(out);
	for (const link of links) {
		const localHref = await localizeGoogleFontHref(link.href, ctx);
		if (!localHref) continue;
		out = out.replace(link.tag, localFontLinkTag(localHref));
	}
	return out;
}

/** Resolve the accumulated font cache into a plain `{ decodedGoogleFontsHref → localAssetHref }`
 * map (dropping any that failed to download). Baked into the build manifest so the runtime SSR
 * path can apply the identical rewrite without re-downloading. Call after every HTML has been
 * localized. */
export async function collectFontMap(ctx: FontBuildContext): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const [href, promise] of ctx.cache) {
		const local = await promise;
		if (local) out[href] = local;
	}
	return out;
}

async function localizeGoogleFontHref(
	href: string,
	ctx: FontBuildContext,
): Promise<string | null> {
	let cached = ctx.cache.get(href);
	if (!cached) {
		cached = downloadAndWriteFontCss(href, ctx);
		ctx.cache.set(href, cached);
	}
	return cached;
}

async function downloadAndWriteFontCss(
	href: string,
	ctx: FontBuildContext,
): Promise<string | null> {
	try {
		const cssRes = await fetch(href, {
			headers: {
				'user-agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
			},
		});
		if (!cssRes.ok) throw new Error(`CSS request failed with ${cssRes.status}`);
		let css = await cssRes.text();
		const fontUrls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];

		await fs.mkdir(path.join(ctx.outAssetsDir, 'fonts'), { recursive: true });
		for (const fontUrl of fontUrls) {
			const localUrl = await downloadFontFile(fontUrl, ctx);
			if (localUrl) css = css.replaceAll(fontUrl, localUrl);
		}

		const cssHash = Bun.hash(css).toString(16).slice(0, 10);
		const cssName = `google-fonts-${cssHash}.css`;
		await fs.writeFile(path.join(ctx.outAssetsDir, 'fonts', cssName), css, 'utf-8');
		ctx.written++;
		return `${ctx.publicPrefix}/${cssName}`;
	} catch (err) {
		console.warn(`[seawomp] could not localize Google Font ${href}: ${(err as Error).message}`);
		return null;
	}
}

async function downloadFontFile(
	fontUrl: string,
	ctx: FontBuildContext,
): Promise<string | null> {
	try {
		const res = await fetch(fontUrl);
		if (!res.ok) throw new Error(`font request failed with ${res.status}`);
		const bytes = Buffer.from(await res.arrayBuffer());
		const ext = extensionFromUrl(fontUrl) || '.woff2';
		const hash = Bun.hash(bytes).toString(16).slice(0, 10);
		const basename = path.basename(new URL(fontUrl).pathname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
		const fileName = `${basename}-${hash}${ext}`;
		await fs.writeFile(path.join(ctx.outAssetsDir, 'fonts', fileName), bytes);
		ctx.written++;
		return `${ctx.publicPrefix}/${fileName}`;
	} catch (err) {
		console.warn(`[seawomp] could not download Google Font asset ${fontUrl}: ${(err as Error).message}`);
		return null;
	}
}

function extensionFromUrl(url: string): string {
	const pathname = new URL(url).pathname;
	const ext = path.extname(pathname).toLowerCase();
	return ext || '.woff2';
}

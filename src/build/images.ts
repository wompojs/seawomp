/* Build-time image pipeline.
 *
 * Handles two categories of images:
 *
 *   LOCAL  — raster files (.jpg/.jpeg/.png/.webp) found inside `publicDir`. Sharp generates
 *            resized variants in each requested format (AVIF + WebP by default).
 *
 *   REMOTE — URLs (http/https) referenced in `<seawomp-image src="…">` inside any TS/JS
 *            source file under `appDir`. Each URL is downloaded once, then run through the
 *            same Sharp optimisation pipeline as local files.
 *
 * The resulting manifest maps every original URL / public path to the list of generated
 * variants. The production handler injects it into `<head>` as `window.__SEAWOMP_IMAGES`
 * so `<seawomp-image>` can build a `srcset` automatically at runtime.
 *
 * `sharp` is a peer-optional dep: if it is not installed, originals are served unchanged and
 * a warning is logged. SVGs are always copied unchanged.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ImageBuildOptions } from '../config.js';

export interface ImageVariant {
	/** URL the browser can fetch (under /_assets/img/). */
	src: string;
	/** MIME type — `image/webp`, `image/avif`, … */
	type: string;
	/** Pixel width of this variant. */
	width: number;
}

export interface ImageManifest {
	/** Maps source URL / public path (e.g. `/images/hero.png` or `https://…`) → variants. */
	[originalUrl: string]: ImageVariant[];
}

const RASTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
};

async function tryLoadSharp(cwd?: string): Promise<any | null> {
	if (cwd) {
		try {
			const resolved = Bun.resolveSync('sharp', cwd);
			const mod = await import(pathToFileURL(resolved).href);
			return (mod as any).default ?? mod;
		} catch {
			/* fall back to seawomp's own resolution context */
		}
	}
	try {
		// @ts-ignore - sharp is a peer-optional dependency
		const mod = await import('sharp');
		return (mod as any).default ?? mod;
	} catch {
		return null;
	}
}

async function walk(dir: string): Promise<string[]> {
	const out: string[] = [];
	async function rec(d: string) {
		let entries: any[];
		try {
			entries = await fs.readdir(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const ent of entries) {
			const abs = path.join(d, ent.name);
			if (ent.isDirectory()) await rec(abs);
			else out.push(abs);
		}
	}
	await rec(dir);
	return out;
}

export interface BuildImagesOptions {
	publicDir: string;
	outAssetsDir: string;
	/** Public URL prefix the variants will be served from (e.g. `/_assets/img`). */
	publicPrefix: string;
	images: Required<ImageBuildOptions>;
	/** Project root used to resolve peer-optional image tooling such as sharp. */
	cwd?: string;
	/** Source directory to scan for remote image URLs (`<seawomp-image src="https://…">`). */
	appDir?: string;
}

/** Returns the manifest and the count of variants written. */
export async function buildImages(
	opts: BuildImagesOptions,
): Promise<{ manifest: ImageManifest; written: number }> {
	const manifest: ImageManifest = {};
	if (opts.images.disabled) return { manifest, written: 0 };

	const imgOut = path.join(opts.outAssetsDir, 'img');
	await fs.mkdir(imgOut, { recursive: true });

	const sharp = await tryLoadSharp(opts.cwd);
	if (!sharp) {
		console.warn(
			'[seawomp] `sharp` not installed — skipping image optimisation (originals served as-is).',
		);
	}

	let written = 0;

	// ── Local images ──────────────────────────────────────────────────────────
	const localFiles = await walk(opts.publicDir);
	for (const abs of localFiles) {
		const ext = path.extname(abs).toLowerCase();
		const rel = '/' + path.relative(opts.publicDir, abs).split(path.sep).join('/');

		if (!RASTER_EXTS.has(ext)) continue;
		if (!sharp) continue;

		const buf = await readFileSafe(abs);
		if (!buf) continue;

		const variants = await processBuffer(buf, ext, path.basename(abs, ext), sharp, opts, imgOut);
		written += variants.length;
		if (variants.length) manifest[rel] = variants;
	}

	// ── Remote images ─────────────────────────────────────────────────────────
	if (opts.appDir) {
		const remoteUrls = await scanRemoteImageUrls(opts.appDir);
		for (const url of remoteUrls) {
			if (manifest[url]) continue; // already processed

			const buf = await downloadImage(url);
			if (!buf) continue;

			const ext = guessExtFromUrl(url);
			if (!RASTER_EXTS.has(ext) && ext !== '') {
				// Non-raster (e.g. SVG): skip optimisation but still add to manifest as-is.
				// For simplicity we just skip — SVGs don't need resizing.
				continue;
			}

			const stem = urlToStem(url);

			if (!sharp) {
				// Can't optimise; skip manifest entry (browser uses the original URL directly).
				continue;
			}

			const variants = await processBuffer(buf, ext || '.jpg', stem, sharp, opts, imgOut);
			written += variants.length;
			if (variants.length) manifest[url] = variants;
		}
	}

	return { manifest, written };
}

export async function writeOptimizedWebManifest(
	publicDir: string,
	staticDir: string,
	imageManifest: ImageManifest,
): Promise<boolean> {
	const sourcePath = path.join(publicDir, 'manifest.json');
	let raw: string;
	try {
		raw = await fs.readFile(sourcePath, 'utf-8');
	} catch {
		return false;
	}

	let parsed: any;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		console.warn(`[seawomp] could not parse public/manifest.json: ${(err as Error).message}`);
		return false;
	}

	if (!Array.isArray(parsed.icons)) return false;
	let changed = false;
	parsed.icons = parsed.icons.map((icon: any) => {
		if (!icon || typeof icon.src !== 'string') return icon;
		const key = normalizePublicImageKey(icon.src);
		const variants = imageManifest[key];
		if (!variants?.length) return icon;
		const requestedWidth = firstWidthFromSizes(icon.sizes);
		const variant = chooseManifestIconVariant(variants, requestedWidth);
		if (!variant) return icon;
		changed = true;
		return { ...icon, src: variant.src, type: variant.type };
	});

	if (!changed) return false;
	await fs.mkdir(staticDir, { recursive: true });
	await fs.writeFile(path.join(staticDir, 'manifest.json'), JSON.stringify(parsed, null, 2), 'utf-8');
	return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readFileSafe(abs: string): Promise<Buffer | null> {
	try {
		return await fs.readFile(abs);
	} catch (err) {
		console.warn(`[seawomp] could not read ${abs}: ${(err as Error).message}`);
		return null;
	}
}

async function processBuffer(
	buf: Buffer,
	sourceExt: string,
	stem: string,
	sharp: any,
	opts: BuildImagesOptions,
	imgOut: string,
): Promise<ImageVariant[]> {
	let metadata: any;
	try {
		metadata = await sharp(buf).metadata();
	} catch (err) {
		console.warn(`[seawomp] sharp metadata failed for ${stem}: ${(err as Error).message}`);
		return [];
	}

	const intrinsicWidth = metadata.width ?? 0;
	if (!intrinsicWidth) return [];

	const targetWidths = [
		...new Set([intrinsicWidth, ...opts.images.sizes.filter((w) => w < intrinsicWidth)]),
	].sort((a, b) => a - b);

	const formats: ('webp' | 'avif' | 'original')[] = [...opts.images.formats, 'original'];
	const variants: ImageVariant[] = [];

	for (const fmt of formats) {
		for (const w of targetWidths) {
			const outExt = fmt === 'original' ? sourceExt : '.' + fmt;
			const outName = `${stem}-${w}${outExt}`;
			const outAbs = path.join(imgOut, outName);
			try {
				let pipeline = sharp(buf).resize({ width: w, withoutEnlargement: true });
				if (fmt === 'webp') pipeline = pipeline.webp({ quality: 80 });
				else if (fmt === 'avif') pipeline = pipeline.avif({ quality: 60 });
				await pipeline.toFile(outAbs);
				variants.push({
					src: `${opts.publicPrefix}/${outName}`,
					type: MIME[outExt] ?? 'application/octet-stream',
					width: w,
				});
			} catch (err) {
				console.warn(
					`[seawomp] sharp encode failed (${stem} → ${fmt}@${w}): ${(err as Error).message}`,
				);
			}
		}
	}

	return variants;
}

/** Download a remote image and return its buffer. Returns null on network error. */
async function downloadImage(url: string): Promise<Buffer | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) {
			console.warn(`[seawomp] remote image fetch failed (${res.status}): ${url}`);
			return null;
		}
		const arr = await res.arrayBuffer();
		return Buffer.from(arr);
	} catch (err) {
		console.warn(`[seawomp] could not download ${url}: ${(err as Error).message}`);
		return null;
	}
}

/** Scan TS/JS files under `appDir` for static `src="https://…"` in <seawomp-image> tags. */
export async function scanRemoteImageUrls(appDir: string): Promise<string[]> {
	const files = await walk(appDir);
	const urls = new Set<string>();
	// Match <seawomp-image … src="https://…"> or src='…' inside template literals.
	// Only static string literals are captured; dynamic expressions (${…}) are skipped.
	const pattern =
		/<seawomp-image\b[^`]*?src=["'](https?:\/\/[^"'\s>]+)["']/g;

	for (const abs of files) {
		if (!/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(abs)) continue;
		let src: string;
		try {
			src = await fs.readFile(abs, 'utf-8');
		} catch {
			continue;
		}
		for (const m of src.matchAll(pattern)) {
			urls.add(m[1]);
		}
	}

	return [...urls];
}

function guessExtFromUrl(url: string): string {
	const clean = url.split('?')[0].split('#')[0];
	const ext = path.extname(clean).toLowerCase();
	return RASTER_EXTS.has(ext) ? ext : '';
}

/** Turn a URL into a safe filesystem stem (no slashes or special chars). */
function urlToStem(url: string): string {
	return url
		.replace(/^https?:\/\//, '')
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.slice(0, 80); // cap length to avoid path-too-long errors
}

function normalizePublicImageKey(src: string): string {
	if (/^https?:\/\//i.test(src)) return src;
	const clean = src.split('?')[0].split('#')[0];
	return clean.startsWith('/') ? clean : '/' + clean;
}

function firstWidthFromSizes(sizes: unknown): number | undefined {
	if (typeof sizes !== 'string') return undefined;
	const match = sizes.match(/(\d+)x\d+/);
	return match ? Number(match[1]) : undefined;
}

function chooseManifestIconVariant(
	variants: ImageVariant[],
	requestedWidth: number | undefined,
): ImageVariant | undefined {
	const originals = variants.filter((variant) => variant.type === 'image/png');
	const pool = originals.length ? originals : variants;
	if (!requestedWidth) return pool[pool.length - 1];
	return (
		pool.find((variant) => variant.width === requestedWidth) ??
		pool.find((variant) => variant.width >= requestedWidth) ??
		pool[pool.length - 1]
	);
}

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineWompo, type RenderHtml } from 'wompo';
import { renderToString } from 'wompo/ssr';
import { Font } from '../../src/font.js';
import { createFontBuildContext, localizeGoogleFontsInHtml } from '../../src/build/fonts.js';
import { postProcessHtml } from '../../src/build/html-postprocess.js';
import { writeSitemap } from '../../src/build/sitemap.js';

let tmpRoot: string;
let originalFetch: typeof fetch;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seawomp-build-perf-'));
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('build performance helpers', () => {
	it('localizes Google Font CSS and font assets', async () => {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('https://fonts.googleapis.com/')) {
				return new Response(
					'@font-face{font-family:Inter;src:url(https://fonts.gstatic.com/s/inter/v18/font.woff2) format("woff2");}',
				);
			}
			if (url.startsWith('https://fonts.gstatic.com/')) {
				return new Response(new Uint8Array([1, 2, 3]));
			}
			return new Response('missing', { status: 404 });
		}) as typeof fetch;

		const assetsDir = path.join(tmpRoot, '_assets');
		const ctx = createFontBuildContext(assetsDir);
		const html = await renderFragment(Font.google({ family: 'Inter', weights: [400, 700] }));
		const localized = await localizeGoogleFontsInHtml(html, ctx);

		expect(localized).toContain('/_assets/fonts/google-fonts-');
		expect(localized).not.toContain('fonts.googleapis.com');
		expect(localized).not.toContain('fonts.gstatic.com');
		const files = fs.readdirSync(path.join(assetsDir, 'fonts'));
		expect(files.some((file) => file.endsWith('.woff2'))).toBe(true);
		expect(files.some((file) => file.endsWith('.css'))).toBe(true);
	});

	it('adds conservative LCP image hints and minifies whitespace between tags', () => {
		const html = `<!doctype html>
			<html><head><title>x</title></head><body>
				<section>
					<img src="/hero.jpg" loading="lazy" alt="Hero">
				</section>
				<pre>  keep
				spaces</pre>
			</body></html>`;

		const out = postProcessHtml(html, { optimizeLcp: true, minify: true });
		expect(out).toContain('<link rel="preload" as="image" href="/hero.jpg" fetchpriority="high">');
		expect(out).toContain('fetchpriority="high"');
		expect(out).toContain('loading="eager"');
		expect(out).not.toContain('>\n');
		expect(out).toMatch(/<pre>  keep\s+spaces<\/pre>/);
	});

	it('preserves all four wompo hydration markers while dropping normal comments', () => {
		// `<!--wc-->` / `<!--/wc-->` bracket a component's `${children}` region; dropping them
		// breaks hydration of every component that renders children (e.g. <seawomp-link>), forcing
		// a destructive client re-render — the per-navigation flicker this guards against.
		const html =
			'<body>' +
			'<!-- drop me -->' +
			'<seawomp-link data-wompo-ssr><a><!--wc--><wompo-logo></wompo-logo><!--/wc--></a></seawomp-link>' +
			'<div><!--w-->text<!--/w--></div>' +
			'</body>';

		const out = postProcessHtml(html, { minify: true });
		expect(out).toContain('<!--wc-->');
		expect(out).toContain('<!--/wc-->');
		expect(out).toContain('<!--w-->');
		expect(out).toContain('<!--/w-->');
		expect(out).not.toContain('drop me');
	});

	it('writes sitemap.xml from prerendered paths and siteUrl', async () => {
		const out = await writeSitemap(tmpRoot, 'https://example.com/', ['/docs', '/', '/docs']);
		expect(out).toBe(path.join(tmpRoot, 'sitemap.xml'));
		const xml = fs.readFileSync(out!, 'utf-8');
		expect(xml).toContain('<loc>https://example.com/</loc>');
		expect(xml).toContain('<loc>https://example.com/docs</loc>');
	});
});

let fragmentCounter = 0;

async function renderFragment(fragment: RenderHtml): Promise<string> {
	const name = `tu-font-fragment-${++fragmentCounter}`;
	function Fragment() {
		return fragment;
	}
	defineWompo(Fragment, { name });
	const rendered = await renderToString(Fragment, {}, { hydration: 'none', css: 'none' });
	return rendered.html.replace(new RegExp(`^<${name}\\b[^>]*>`, 'i'), '').replace(`</${name}>`, '');
}

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig } from '../../src/config.js';
import { buildAll } from '../../src/build/bundle.js';
import type { BuildManifest } from '../../src/server/manifest.js';

const FIXTURE_PARENT = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../.tmp-build-output',
);

let tmpRoot: string;

beforeEach(() => {
	fs.mkdirSync(FIXTURE_PARENT, { recursive: true });
	tmpRoot = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'b-'));
	fs.mkdirSync(path.join(tmpRoot, 'app'), { recursive: true });
	fs.mkdirSync(path.join(tmpRoot, 'public'), { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(rel: string, content: string) {
	const abs = path.join(tmpRoot, rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content);
	return abs;
}

describe('production build output', () => {
	it('rewrites hydrate route imports to emitted client asset URLs', async () => {
		write(
			'app/page.ts',
			`import { html, defineWompo } from 'wompo';
       function Home(){ return html\`<h1>home</h1>\`; }
       defineWompo(Home, { name: 'build-home' });
       export default Home;`,
		);
		write(
			'app/about/page.ts',
			`import { html, defineWompo } from 'wompo';
       function About(){ return html\`<h1>about</h1>\`; }
       defineWompo(About, { name: 'build-about' });
       export default About;`,
		);

		const cfg = resolveConfig(tmpRoot, { outDir: '.seawomp', publicDir: 'public' }, 'build');
		await buildAll(cfg, tmpRoot);

		const manifest = JSON.parse(
			fs.readFileSync(path.join(tmpRoot, '.seawomp/manifest.json'), 'utf-8'),
		) as BuildManifest;
		const hydratePath = path.join(tmpRoot, '.seawomp/static', manifest.hydrateRuntime);
		const code = fs.readFileSync(hydratePath, 'utf-8');

		expect(code).toContain('/_assets/route-');
		expect(code).not.toContain(tmpRoot);
		expect(code).not.toContain('/app/page.ts');
	});

	it('generates framework discoverability head and files without config-owned CSS', async () => {
		write(
			'app/page.ts',
			`import { html, defineWompo } from 'wompo';
       function Home(){ return html\`<h1>home</h1>\`; }
       defineWompo(Home, { name: 'build-inline-home' });
       export default Home;
       export const prerender = true;`,
		);

		const cfg = resolveConfig(
			tmpRoot,
			{
				outDir: '.seawomp',
				publicDir: 'public',
				siteUrl: 'https://example.com',
				discoverability: { llmsTxt: true, sitemapTxt: true, robotsTxt: true },
			},
			'build',
		);
		await buildAll(cfg, tmpRoot);

		const html = fs.readFileSync(path.join(tmpRoot, '.seawomp/static/index.html'), 'utf-8');
		expect(html).toContain('<link rel="alternate" type="text/plain" href="/llms.txt" title="LLMs text" />');
		expect(html).not.toContain('data-seawomp-global');
		expect(html).not.toContain('/_assets/global-');
		expect(fs.existsSync(path.join(tmpRoot, '.seawomp/static/llms.txt'))).toBe(true);
		expect(fs.existsSync(path.join(tmpRoot, '.seawomp/static/sitemap.txt'))).toBe(true);
		expect(fs.readFileSync(path.join(tmpRoot, '.seawomp/static/robots.txt'), 'utf-8')).toContain(
			'Sitemap: https://example.com/sitemap.txt',
		);
	});
});

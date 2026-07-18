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

	it('emits a client hydrate chunk for the 404 special route so its islands hydrate', async () => {
		write(
			'app/layout.ts',
			`import { html, defineWompo } from 'wompo';
       function RootLayout({ children }){ return html\`<main>\${children}</main>\`; }
       defineWompo(RootLayout, { name: 'build-404-layout' });
       export default RootLayout;`,
		);
		write(
			'app/page.ts',
			`import { html, defineWompo } from 'wompo';
       function Home(){ return html\`<h1>home</h1>\`; }
       defineWompo(Home, { name: 'build-404-home' });
       export default Home;`,
		);
		write(
			'app/404.ts',
			`import { html, defineWompo } from 'wompo';
       function NotFound(){ return html\`<h1>not found</h1>\`; }
       defineWompo(NotFound, { name: 'build-404-page' });
       export default NotFound;`,
		);

		const cfg = resolveConfig(tmpRoot, { outDir: '.seawomp', publicDir: 'public' }, 'build');
		await buildAll(cfg, tmpRoot);

		const manifest = JSON.parse(
			fs.readFileSync(path.join(tmpRoot, '.seawomp/manifest.json'), 'utf-8'),
		) as BuildManifest;
		// The special route is recorded server-side…
		expect(manifest.notFoundRoute).toBeDefined();

		const hydratePath = path.join(tmpRoot, '.seawomp/static', manifest.hydrateRuntime);
		const code = fs.readFileSync(hydratePath, 'utf-8');

		// …and a distinct client chunk is emitted for the 404 page (the one that defines its island).
		const assetsDir = path.join(tmpRoot, '.seawomp/static/_assets');
		const pageChunks = fs
			.readdirSync(assetsDir)
			.filter((f) => /^route-.*-page-.*\.js$/.test(f));
		const notFoundChunk = pageChunks.find((f) =>
			fs.readFileSync(path.join(assetsDir, f), 'utf-8').includes('build-404-page'),
		);
		expect(notFoundChunk).toBeDefined();

		// Before the fix the 404's chunk was never referenced by the hydrate entry (it only mapped
		// the normal routes), so a 404 render logged "island not registered". Now it is wired in…
		expect(code).toContain(notFoundChunk!);
		// …and the bootstrap consumes the SSR render marker so error/404 renders hydrate
		// deterministically instead of relying on a URL match that a 404 never has.
		expect(code).toContain('data-seawomp-render');
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

	it('excludes sitemap=false pages from sitemap.xml and prerenders translated i18n routes', async () => {
		write(
			'app/page.ts',
			`import { html, defineWompo } from 'wompo';
       function Home(){ return html\`<h1>home</h1>\`; }
       defineWompo(Home, { name: 'build-i18n-home' });
       export default Home;
       export const prerender = true;`,
		);
		write(
			'app/projects/page.ts',
			`import { html, defineWompo } from 'wompo';
       function Projects(){ return html\`<h1>projects</h1>\`; }
       defineWompo(Projects, { name: 'build-i18n-projects' });
       export default Projects;
       export const prerender = true;`,
		);
		write(
			'app/admin/page.ts',
			`import { html, defineWompo } from 'wompo';
       function Admin(){ return html\`<h1>admin</h1>\`; }
       defineWompo(Admin, { name: 'build-i18n-admin' });
       export default Admin;
       export const prerender = true;
       export const sitemap = false;`,
		);

		const cfg = resolveConfig(
			tmpRoot,
			{
				outDir: '.seawomp',
				publicDir: 'public',
				siteUrl: 'https://example.com',
				i18n: {
					locales: ['en', 'it'],
					defaultLocale: 'en',
					routes: { '/projects': { it: '/progetti' } },
				},
			},
			'build',
		);
		await buildAll(cfg, tmpRoot);

		// Translated locale variant is prerendered at the translated path.
		expect(
			fs.existsSync(path.join(tmpRoot, '.seawomp/static/it/progetti/index.html')),
		).toBe(true);
		expect(
			fs.existsSync(path.join(tmpRoot, '.seawomp/static/it/projects/index.html')),
		).toBe(false);

		const sitemap = fs.readFileSync(path.join(tmpRoot, '.seawomp/static/sitemap.xml'), 'utf-8');
		expect(sitemap).toContain('https://example.com/projects');
		expect(sitemap).toContain('https://example.com/it/progetti');
		// The admin page is prerendered but must not be advertised.
		expect(fs.existsSync(path.join(tmpRoot, '.seawomp/static/admin/index.html'))).toBe(true);
		expect(sitemap).not.toContain('/admin');
	});

	it('emits srcset in prerendered HTML from the sharp image pipeline', async () => {
		const sharp = (await import('sharp')).default;
		const heroPng = await sharp({
			create: { width: 1600, height: 900, channels: 3, background: { r: 200, g: 60, b: 60 } },
		})
			.png()
			.toBuffer();
		fs.mkdirSync(path.join(tmpRoot, 'public/images'), { recursive: true });
		fs.writeFileSync(path.join(tmpRoot, 'public/images/hero.png'), heroPng);

		// Import the component by absolute path: it gets bundled as a separate copy, which is
		// exactly what the globalThis-backed manifest store must survive. Interpolated usage
		// (`<${Image} …>`) is what wompo expands server-side; a literal `<seawomp-image>` tag
		// is emitted as-is and only builds its DOM on connect.
		const imageComponent = path.resolve(
			path.dirname(new URL(import.meta.url).pathname),
			'../../src/components/image.ts',
		);
		write(
			'app/page.ts',
			`import { html, defineWompo } from 'wompo';
       import SeawompImage from ${JSON.stringify(imageComponent)};
       function Home(){
         return html\`<main><\${SeawompImage} src="/images/hero.png" alt="hero" width="1600" height="900" /></main>\`;
       }
       defineWompo(Home, { name: 'build-img-home' });
       export default Home;
       export const prerender = true;`,
		);

		const cfg = resolveConfig(tmpRoot, { outDir: '.seawomp', publicDir: 'public' }, 'build');
		await buildAll(cfg, tmpRoot);

		// Variants generated by sharp land in the static assets dir.
		expect(
			fs.existsSync(path.join(tmpRoot, '.seawomp/static/_assets/img/hero-640.avif')),
		).toBe(true);
		expect(
			fs.existsSync(path.join(tmpRoot, '.seawomp/static/_assets/img/hero-1600.webp')),
		).toBe(true);

		const html = fs.readFileSync(path.join(tmpRoot, '.seawomp/static/index.html'), 'utf-8');
		// srcset is already present in the server-rendered markup (not only after hydration)…
		expect(html).toContain('srcset="/_assets/img/hero-640.avif 640w,');
		expect(html).toContain('/_assets/img/hero-1600.png 1600w"');
		// …the LCP preload advertises the optimized variants…
		expect(html).toMatch(/<link rel="preload" as="image"[^>]*imagesrcset=/);
		// …and the client-side manifest is still injected for post-hydration renders.
		expect(html).toContain('window.__SEAWOMP_IMAGES=');
	});
});

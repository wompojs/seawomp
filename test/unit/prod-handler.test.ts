import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore — using built dist of wompo for SSR APIs
import { defineAction, devalue } from 'wompo/ssr';
import { resolveConfig } from '../../src/config.js';
import { createProdHandler } from '../../src/build/serve-prod.js';
import { createVercelApp } from '../../src/adapters/vercel.js';
import type { BuildManifest } from '../../src/server/manifest.js';

const FIXTURE_PARENT = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../.tmp-prod-handler',
);

let tmpRoot: string;
let outDir: string;

beforeEach(() => {
	fs.mkdirSync(FIXTURE_PARENT, { recursive: true });
	tmpRoot = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'p-'));
	outDir = path.join(tmpRoot, '.seawomp');
	fs.mkdirSync(path.join(outDir, 'server'), { recursive: true });
	fs.mkdirSync(path.join(outDir, 'static'), { recursive: true });
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

function writeManifest(partial: Partial<BuildManifest>) {
	const manifest: BuildManifest = {
		routes: [],
		apiRoutes: [],
		islands: {},
		hydrateRuntime: '/_hydrate.js',
		images: {},
		...partial,
	};
	write('.seawomp/manifest.json', JSON.stringify(manifest, null, 2));
}

async function prodHandler(config = {}) {
	const cfg = resolveConfig(tmpRoot, { outDir: '.seawomp', publicDir: 'public', ...config }, 'build');
	return createProdHandler(cfg, tmpRoot);
}

describe('createProdHandler', () => {
	it('serves built static assets and prerendered HTML', async () => {
		writeManifest({});
		write('.seawomp/static/_assets/app.js', 'console.log("asset")');
		write('.seawomp/static/about/index.html', '<h1>about-static</h1>');

		const handler = await prodHandler();
		const asset = await handler(
			new Request('http://x/_assets/app.js', {
				headers: { 'accept-encoding': 'br' },
			}),
		);
		expect(asset.status).toBe(200);
		expect(asset.headers.get('content-type')).toBe('application/javascript');
		expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(asset.headers.get('content-encoding')).toBe('br');

		const page = await handler(new Request('http://x/about'));
		expect(page.status).toBe(200);
		expect(page.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(await page.text()).toContain('about-static');
	});

	it('renders dynamic SSR routes from server bundle paths in the manifest', async () => {
		write(
			'.seawomp/server/app/hello/page.js',
			`import { html, defineWompo } from 'wompo';
       function Hello(){ return html\`<h1>hello-prod</h1>\`; }
       defineWompo(Hello, { name: 'prod-hello' });
       export default Hello;`,
		);
		writeManifest({
			routes: [
				{
					pattern: '/hello',
					page: 'app/hello/page.ts',
					layouts: [],
					serverPage: 'server/app/hello/page.js',
					serverLayouts: [],
					css: [],
				},
			],
		});

		const handler = await prodHandler();
		const res = await handler(new Request('http://x/hello'));
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('hello-prod');
	});

	it('dispatches API route bundles', async () => {
		write(
			'.seawomp/server/app/api/health/route.js',
			`export const GET = () => Response.json({ ok: true });`,
		);
		writeManifest({
			apiRoutes: [
				{
					pattern: '/api/health',
					modulePath: 'app/api/health/route.ts',
					serverModulePath: 'server/app/api/health/route.js',
				},
			],
		});

		const handler = await prodHandler();
		const res = await handler(new Request('http://x/api/health'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it('handles server actions before route matching', async () => {
		defineAction(async (name: string) => `prod-${name}`, 'prod-unit-action');
		writeManifest({});

		const handler = await prodHandler();
		const res = await handler(
			new Request('http://x/_action/prod-unit-action', {
				method: 'POST',
				body: devalue.stringify(['ok']),
			}),
		);

		expect(res.status).toBe(200);
		expect(devalue.parse(await res.text())).toBe('prod-ok');
	});

	it('returns 404 for unknown routes', async () => {
		writeManifest({});
		const handler = await prodHandler();
		const res = await handler(new Request('http://x/not-found'));
		expect(res.status).toBe(404);
	});

	it('applies redirects before serving static files', async () => {
		writeManifest({});
		write('.seawomp/static/old.txt', 'old');
		const handler = await prodHandler({
			redirects: [{ source: '/old.txt', destination: '/new.txt', status: 308 }],
		});
		const res = await handler(new Request('http://x/old.txt'));
		expect(res.status).toBe(308);
		expect(res.headers.get('location')).toBe('/new.txt');
	});

	it('renders bundled app/404.ts for unknown routes', async () => {
		write(
			'.seawomp/server/app/404.js',
			`import { html, defineWompo } from 'wompo';
       function NotFound(){ return html\`<h1>prod 404</h1>\`; }
       defineWompo(NotFound, { name: 'prod-not-found' });
       export default NotFound;`,
		);
		writeManifest({
			notFoundRoute: {
				page: 'app/404.ts',
				layouts: [],
				serverPage: 'server/app/404.js',
				serverLayouts: [],
			},
		});
		const handler = await prodHandler();
		const res = await handler(new Request('http://x/nope'));
		expect(res.status).toBe(404);
		expect(await res.text()).toContain('prod 404');
	});

	it('exposes the production handler through the Vercel Hono adapter', async () => {
		writeManifest({});
		write('.seawomp/static/ping.txt', 'pong');

		const app = createVercelApp({
			cwd: tmpRoot,
			config: { outDir: '.seawomp', publicDir: 'public' },
		});
		const res = await app.fetch(new Request('http://x/ping.txt'));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('pong');
	});
});

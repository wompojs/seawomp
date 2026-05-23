/* Node-side smoke E2E that exercises the fixture app against the production-style handler.
 *
 * This intentionally avoids spawning a browser (Playwright is a heavy dependency we don't want
 * to require for `npm test`). Hydration semantics that need a DOM are covered by the wompo
 * hydration tests under happy-dom; here we focus on the request → SSR HTML pipeline:
 *   - Each route returns a 200 with the expected content.
 *   - Layouts wrap pages correctly.
 *   - Loader-driven data appears in the SSR'd HTML.
 *   - Island markup is present in the dashboard route (data-wompo-island).
 *   - Server-action endpoint round-trips.
 *
 * A Playwright spec lives next to this file (e2e.browser.spec.ts) — opt-in via
 * `npm run test:e2e` once Playwright is installed.
 */
import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanRoutes } from '../../src/server/routes.js';
import { createHandler } from '../../src/server/handler.js';
// @ts-ignore — runtime API
import { defineAction, devalue } from 'wompo/ssr';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture/app');

const loadModule = (abs: string): Promise<any> => import(pathToFileURL(abs).href);

// The fixture uses `_post/` instead of `[id]/` because Vitest's Vite-backed dynamic-import
// resolver rejects URL-encoded brackets. The runtime convention is still `[id]`; the
// `routes.test.ts` suite covers that mapping. Here we hand-rewrite the pattern so route matching
// behaves as it would in a real `app/[id]/` layout.
const routes = scanRoutes(fixtureDir).map((r) =>
	r.pagePath.includes('/_post/') ? { ...r, pattern: r.pattern.replace('/_post', '/:id') } : r,
);
const handler = createHandler({ routes, loadModule });

const stripMarkers = (s: string) => s.replace(/<!--\/?w-->/g, '');

describe('fixture app — server-side smoke', () => {
	it('discovers the three expected routes', () => {
		const patterns = routes.map((r) => r.pattern).sort();
		expect(patterns).toEqual(['/', '/blog/:id', '/dashboard']);
	});

	it('home page (SSG candidate) renders', async () => {
		const res = await handler(new Request('http://x/'));
		expect(res.status).toBe(200);
		const html = stripMarkers(await res.text());
		expect(html).toContain('Welcome to seawomp');
		expect(html).toContain('fx-root-layout');
		expect(html).toContain('fx-home-page');
		// Root layout's nav should be present.
		expect(html).toContain('seawomp-link');
	});

	it('blog/:id renders with loader data', async () => {
		const res = await handler(new Request('http://x/blog/7'));
		expect(res.status).toBe(200);
		const html = stripMarkers(await res.text());
		expect(html).toContain('Post 7');
		expect(html).toContain('This is the body for post #7.');
	});

	it('dashboard route emits all three islands with their hydration modes', async () => {
		const res = await handler(new Request('http://x/dashboard'));
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toMatch(/<fx-counter-load[^>]*data-wompo-mode="load"/);
		expect(html).toMatch(/<fx-counter-idle[^>]*data-wompo-mode="idle"/);
		expect(html).toMatch(/<fx-counter-visible[^>]*data-wompo-mode="visible"/);
		// Each island carries its initial props payload.
		expect(html).toContain('data-wompo-props');
	});

	it('unknown route returns 404', async () => {
		const res = await handler(new Request('http://x/missing-page'));
		expect(res.status).toBe(404);
	});

	it('server action round-trips', async () => {
		defineAction(async (a: number) => a * 2, 'fixture-double');
		const res = await handler(
			new Request('http://x/_action/fixture-double', {
				method: 'POST',
				body: devalue.stringify([21]),
			}),
		);
		expect(res.status).toBe(200);
		expect(devalue.parse(await res.text())).toBe(42);
	});
});

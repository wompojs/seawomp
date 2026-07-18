import { describe, expect, it } from 'bun:test';
import { defineWompo } from 'wompo';
import { renderToString } from 'wompo/ssr';
import { buildHydrateEntry } from '../../src/dev/virtual.js';
import { seoI18nHead } from '../../src/i18n/index.js';

describe('buildHydrateEntry', () => {
	it('passes i18n routing options to the client router', () => {
		const source = buildHydrateEntry(
			[
				{
					pattern: '/docs/:slug*',
					pagePath: '/repo/app/docs/page.ts',
					layoutPaths: ['/repo/app/layout.ts'],
				},
			],
			{ i18n: { locales: ['en', 'it'], defaultLocale: 'en' } },
		);

		expect(source).toContain("import { hydrate, setRoutes, setRouterOptions, canonicalPathname }");
		expect(source).toContain('setRouterOptions({"i18n":{"locales":["en","it"],"defaultLocale":"en"}});');
		expect(source).toContain('const pathname = canonicalPathname(location.pathname);');
		expect(source).toContain('"pattern":"/docs/:slug*"');
	});

	it('passes navigation transition options to the client router', () => {
		const source = buildHydrateEntry([], {
			navigation: { viewTransitions: false },
		});

		expect(source).toContain('setRouterOptions({"viewTransitions":false});');
	});

	it('emits an empty special table when no 404/error routes exist', () => {
		const source = buildHydrateEntry([
			{ pattern: '/', pagePath: '/repo/app/page.ts', layoutPaths: ['/repo/app/layout.ts'] },
		]);
		expect(source).toContain('const special = {"notFound":null,"error":null};');
	});

	it('emits special-route client records + a marker-aware bootstrap with a 404 fallback', () => {
		const source = buildHydrateEntry(
			[{ pattern: '/', pagePath: '/repo/app/page.ts', layoutPaths: ['/repo/app/layout.ts'] }],
			{
				specialRoutes: {
					notFoundRoute: {
						pagePath: '/repo/app/404.ts',
						layoutPaths: ['/repo/app/layout.ts'],
					},
					errorRoute: {
						pagePath: '/repo/app/error.ts',
						layoutPaths: ['/repo/app/layout.ts'],
					},
				},
			},
		);

		// Special routes carry their own page + layout module URLs.
		expect(source).toContain(
			'const special = {"notFound":{"page":"/_src/repo/app/404.ts","layouts":["/_src/repo/app/layout.ts"]},"error":{"page":"/_src/repo/app/error.ts","layouts":["/_src/repo/app/layout.ts"]}};',
		);
		// The bootstrap prefers the SSR render marker, then URL match, then the 404 fallback.
		expect(source).toContain("document.documentElement.getAttribute('data-seawomp-render')");
		expect(source).toContain("kind === 'not-found'");
		expect(source).toContain("kind === 'error'");
		expect(source).toContain('if (!matched && special.notFound) await importRecord(special.notFound);');
	});
});

describe('seoI18nHead', () => {
	it('generates canonical, hreflang and Open Graph locale tags', async () => {
		const fragment = seoI18nHead({
			siteUrl: 'https://example.com',
			pathname: '/it/docs/intro',
			i18n: { locales: ['en', 'it'], defaultLocale: 'en' },
			ogLocale: { en: 'en_US', it: 'it_IT' },
		});
		function Head() {
			return fragment;
		}
		defineWompo(Head, { name: 'tu-seo-head' });
		const head = (await renderToString(Head, {}, { hydration: 'none', css: 'none' })).html;

		expect(head).toContain('<link rel="canonical" href="https://example.com/it/docs/intro">');
		expect(head).toContain('hreflang="en"');
		expect(head).toContain('href="https://example.com/docs/intro"');
		expect(head).toContain('hreflang="it"');
		expect(head).toContain('href="https://example.com/it/docs/intro"');
		expect(head).toContain('hreflang="x-default"');
		expect(head).toContain('<meta property="og:url" content="https://example.com/it/docs/intro">');
		expect(head).toContain('<meta property="og:locale" content="it_IT">');
	});

	it('applies i18n.routes translations to canonical and hreflang alternates', async () => {
		const fragment = seoI18nHead({
			siteUrl: 'https://example.com',
			pathname: '/it/progetti',
			i18n: {
				locales: ['en', 'it'],
				defaultLocale: 'en',
				routes: { '/projects': { it: '/progetti' } },
			},
		});
		function Head() {
			return fragment;
		}
		defineWompo(Head, { name: 'tu-seo-head-translated' });
		const head = (await renderToString(Head, {}, { hydration: 'none', css: 'none' })).html;

		expect(head).toContain('<link rel="canonical" href="https://example.com/it/progetti">');
		expect(head).toContain('href="https://example.com/projects"');
		expect(head).toContain('href="https://example.com/it/progetti"');
		// The untranslated localized URL must never appear as an alternate.
		expect(head).not.toContain('https://example.com/it/projects');
	});
});

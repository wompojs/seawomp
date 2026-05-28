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

		expect(source).toContain("import { hydrate, setRoutes, setRouterOptions }");
		expect(source).toContain('setRouterOptions({"i18n":{"locales":["en","it"],"defaultLocale":"en"}});');
		expect(source).toContain('const pathname = stripLocalePrefix(location.pathname);');
		expect(source).toContain('"pattern":"/docs/:slug*"');
	});

	it('passes navigation transition options to the client router', () => {
		const source = buildHydrateEntry([], {
			navigation: { viewTransitions: false },
		});

		expect(source).toContain('setRouterOptions({"viewTransitions":false});');
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
});

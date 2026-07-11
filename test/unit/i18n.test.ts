/* Unit tests for the i18n URL helpers — locale prefixing plus the i18n.routes
 * translation map (translated slugs like /projects → /it/progetti). */
import { describe, expect, it } from 'bun:test';
import {
	alternateUrls,
	localizeHref,
	localizePathname,
	delocalizePathname,
	translateRoutePath,
	untranslateRoutePath,
	type I18nConfig,
} from '../../src/i18n/index.js';

const routes = {
	'/projects': { it: '/progetti', fr: '/projets' },
	'/about': { it: '/chi-siamo' },
};

const config: I18nConfig = {
	locales: ['en', 'it', 'fr'],
	defaultLocale: 'en',
	routes,
};

describe('translateRoutePath', () => {
	it('translates a mapped path for a non-default locale', () => {
		expect(translateRoutePath('/projects', 'it', 'en', routes)).toBe('/progetti');
	});

	it('returns the canonical path for the default locale', () => {
		expect(translateRoutePath('/projects', 'en', 'en', routes)).toBe('/projects');
	});

	it('passes unmapped paths through unchanged', () => {
		expect(translateRoutePath('/blog', 'it', 'en', routes)).toBe('/blog');
	});

	it('translates nested paths via the longest matching prefix', () => {
		expect(translateRoutePath('/projects/alpha', 'it', 'en', routes)).toBe('/progetti/alpha');
	});

	it('falls back to canonical for locales without a mapping', () => {
		expect(translateRoutePath('/about', 'fr', 'en', routes)).toBe('/about');
	});

	it('is a no-op without a routes map', () => {
		expect(translateRoutePath('/projects', 'it', 'en')).toBe('/projects');
	});
});

describe('untranslateRoutePath', () => {
	it('maps a translated path back to canonical', () => {
		expect(untranslateRoutePath('/progetti', 'it', 'en', routes)).toBe('/projects');
	});

	it('maps nested translated paths back to canonical', () => {
		expect(untranslateRoutePath('/progetti/alpha', 'it', 'en', routes)).toBe('/projects/alpha');
	});

	it('does not apply another locale’s translations', () => {
		expect(untranslateRoutePath('/projets', 'it', 'en', routes)).toBe('/projets');
	});

	it('passes untranslated paths through unchanged', () => {
		expect(untranslateRoutePath('/projects', 'it', 'en', routes)).toBe('/projects');
	});
});

describe('localizePathname', () => {
	it('translates and prefixes for a non-default locale', () => {
		expect(localizePathname('/projects', 'it', config)).toBe('/it/progetti');
	});

	it('keeps the canonical path for the default locale', () => {
		expect(localizePathname('/projects', 'en', config)).toBe('/projects');
	});

	it('prefixes without translating when no mapping exists', () => {
		expect(localizePathname('/blog', 'it', config)).toBe('/it/blog');
	});

	it('handles the root path', () => {
		expect(localizePathname('/', 'it', config)).toBe('/it');
	});
});

describe('delocalizePathname', () => {
	it('strips the prefix and untranslates', () => {
		expect(delocalizePathname('/it/progetti', config)).toBe('/projects');
		expect(delocalizePathname('/it/progetti/alpha', config)).toBe('/projects/alpha');
	});

	it('returns default-locale paths unchanged', () => {
		expect(delocalizePathname('/projects', config)).toBe('/projects');
	});
});

describe('localizeHref with routes', () => {
	const args = ['it', 'en', config.locales, routes] as const;

	it('translates internal hrefs', () => {
		expect(localizeHref('/projects', ...args)).toBe('/it/progetti');
	});

	it('re-translates hrefs already localized for another locale', () => {
		expect(localizeHref('/it/progetti', 'fr', 'en', config.locales, routes)).toBe('/fr/projets');
	});

	it('untranslates when targeting the default locale', () => {
		expect(localizeHref('/it/progetti', 'en', 'en', config.locales, routes)).toBe('/projects');
	});

	it('preserves query and hash', () => {
		expect(localizeHref('/projects?tab=1#top', ...args)).toBe('/it/progetti?tab=1#top');
	});

	it('leaves external and special-scheme URLs unchanged', () => {
		expect(localizeHref('https://example.com/projects', ...args)).toBe(
			'https://example.com/projects',
		);
		expect(localizeHref('#section', ...args)).toBe('#section');
		expect(localizeHref('mailto:x@y.z', ...args)).toBe('mailto:x@y.z');
	});

	it('keeps prior behavior when no routes map is provided', () => {
		expect(localizeHref('/projects', 'it', 'en', config.locales)).toBe('/it/projects');
	});
});

describe('alternateUrls with routes', () => {
	it('produces translated URLs per locale', () => {
		expect(alternateUrls('/projects', config)).toEqual({
			en: '/projects',
			it: '/it/progetti',
			fr: '/fr/projets',
		});
	});
});

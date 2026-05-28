/* seawomp i18n helpers.
 *
 * Lightweight, framework-agnostic utilities for locale routing and message translation.
 * No runtime dependencies beyond what seawomp already uses.
 *
 * Usage in a loader:
 *
 *   import { getLocale, loadMessages, createTranslator } from 'seawomp/i18n';
 *   import { defineConfig } from 'seawomp/config';
 *   import { i18nConfig } from '../seawomp.config.js';
 *
 *   export const loader = async ({ url }) => {
 *     const locale = getLocale(url, i18nConfig);
 *     const messages = await loadMessages(locale, new URL('../messages', import.meta.url).pathname);
 *     return { locale, messages };
 *   };
 *
 * Usage in a page component:
 *
 *   function MyPage({ data }) {
 *     const t = createTranslator(data.messages);
 *     return html`<h1>${t('home.title')}</h1>`;
 *   }
 *
 * URL routing convention:
 *   - Default locale:     /about        (no prefix)
 *   - Non-default locale: /it/about
 *
 * The server handler automatically strips the locale prefix before route matching when
 * `SeawompConfig.i18n` is set. Pages always receive their route params without the locale
 * segment; the full URL (including the prefix) is available via LoaderArgs.url.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { html } from 'wompo';
export { detectClientLocale, getActiveSsrLocale, getClientI18nConfig, localizeHref, setActiveSsrLocale, setClientI18nConfig, } from './context.js';
// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------
/**
 * Extract the active locale from a URL.
 *
 * Reads the first path segment. If it matches a configured locale, that locale is returned.
 * Otherwise the `defaultLocale` is used.
 *
 * @example
 *   getLocale(new URL('https://site.com/it/blog'), { locales: ['en', 'it'], defaultLocale: 'en' })
 *   // → 'it'
 *   getLocale(new URL('https://site.com/blog'), { locales: ['en', 'it'], defaultLocale: 'en' })
 *   // → 'en'
 */
export function getLocale(url, config) {
    const first = url.pathname.split('/').filter(Boolean)[0];
    return first && config.locales.includes(first) ? first : config.defaultLocale;
}
/** Whether a pathname starts with a supported locale prefix. */
export function hasLocalePrefix(pathname, config) {
    const first = pathname.split('/').filter(Boolean)[0];
    return Boolean(first && config.locales.includes(first));
}
/**
 * Strip the locale prefix from a pathname, if present.
 * The default locale never has a prefix, so `/about` is returned unchanged.
 *
 * @example
 *   stripLocalePrefix('/it/about', 'it', 'en')  // → '/about'
 *   stripLocalePrefix('/about', 'en', 'en')      // → '/about'
 *   stripLocalePrefix('/it', 'it', 'en')         // → '/'
 */
export function stripLocalePrefix(pathname, locale, defaultLocale) {
    if (locale === defaultLocale)
        return pathname;
    const prefix = '/' + locale;
    if (pathname === prefix)
        return '/';
    if (pathname.startsWith(prefix + '/'))
        return pathname.slice(prefix.length);
    return pathname;
}
/**
 * Add a locale prefix to a pathname.
 * The default locale gets no prefix.
 *
 * @example
 *   localizeUrl('/about', 'it', 'en')  // → '/it/about'
 *   localizeUrl('/about', 'en', 'en')  // → '/about'
 *   localizeUrl('/', 'it', 'en')       // → '/it'
 */
export function localizeUrl(pathname, locale, defaultLocale) {
    if (locale === defaultLocale)
        return pathname;
    const norm = pathname === '/' ? '' : pathname;
    return '/' + locale + norm;
}
/** Pick the best supported locale from an Accept-Language header. */
export function preferredLocaleFromAcceptLanguage(acceptLanguage, config) {
    if (!acceptLanguage)
        return config.defaultLocale;
    const candidates = acceptLanguage
        .split(',')
        .map((part, index) => {
        const [rawTag, ...params] = part.trim().split(';');
        const qParam = params.find((param) => param.trim().startsWith('q='));
        const q = qParam ? Number(qParam.trim().slice(2)) : 1;
        const tag = rawTag.toLowerCase();
        return {
            index,
            q: Number.isFinite(q) ? q : 0,
            tag,
            base: tag.split('-')[0],
        };
    })
        .filter((candidate) => candidate.tag);
    candidates.sort((a, b) => b.q - a.q || a.index - b.index);
    for (const candidate of candidates) {
        const exact = config.locales.find((locale) => locale.toLowerCase() === candidate.tag);
        if (exact)
            return exact;
        const base = config.locales.find((locale) => locale.toLowerCase() === candidate.base);
        if (base)
            return base;
    }
    return config.defaultLocale;
}
/**
 * Build a map of `{ locale → localizedUrl }` for all configured locales.
 * Useful for rendering hreflang links in the `<head>`.
 *
 * @example
 *   alternateUrls('/about', { locales: ['en', 'it'], defaultLocale: 'en' })
 *   // → { en: '/about', it: '/it/about' }
 */
export function alternateUrls(pathname, config) {
    const out = {};
    for (const locale of config.locales) {
        out[locale] = localizeUrl(pathname, locale, config.defaultLocale);
    }
    return out;
}
/** Generate canonical, hreflang, og:url and og:locale tags for localized routes. */
export function seoI18nHead(options) {
    const locale = options.locale ??
        getLocale(new URL(normalizePath(options.pathname), 'https://seawomp.local'), options.i18n);
    const canonicalPath = options.canonicalPathname ?? options.pathname;
    const basePath = unlocalizedPath(canonicalPath, locale, options.i18n);
    const alternate = alternateUrls(basePath, options.i18n);
    const canonicalUrl = absoluteUrl(options.siteUrl, canonicalPath);
    const xDefaultLocale = options.xDefaultLocale ?? options.i18n.defaultLocale;
    const xDefaultPath = alternate[xDefaultLocale] ?? localizeUrl(basePath, xDefaultLocale, options.i18n.defaultLocale);
    return html `
		<link rel="canonical" href="${canonicalUrl}">
		${options.i18n.locales.map((entry) => html `
				<link
					rel="alternate"
					hreflang="${entry}"
					href="${absoluteUrl(options.siteUrl, alternate[entry])}"
				>
			`)}
		<link
			rel="alternate"
			hreflang="x-default"
			href="${absoluteUrl(options.siteUrl, xDefaultPath)}"
		>
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:locale" content="${toOgLocale(locale, options.ogLocale)}">
		${options.i18n.locales
        .filter((entry) => entry !== locale)
        .map((entry) => html `
					<meta
						property="og:locale:alternate"
						content="${toOgLocale(entry, options.ogLocale)}"
					>
				`)}
	`;
}
function unlocalizedPath(pathname, locale, config) {
    const normalized = normalizePath(pathname);
    if (locale === config.defaultLocale)
        return normalized;
    return stripLocalePrefix(normalized, locale, config.defaultLocale);
}
function absoluteUrl(siteUrl, pathname) {
    if (/^https?:\/\//i.test(pathname))
        return pathname;
    const origin = siteUrl.replace(/\/+$/, '');
    return origin + normalizePath(pathname);
}
function normalizePath(pathname) {
    if (!pathname)
        return '/';
    return pathname.startsWith('/') ? pathname : '/' + pathname;
}
function toOgLocale(locale, map) {
    if (map?.[locale])
        return map[locale];
    const [language, region] = locale.split(/[-_]/);
    return `${language}${region ? '_' + region.toUpperCase() : '_' + language.toUpperCase()}`;
}
// ---------------------------------------------------------------------------
// Message loading
// ---------------------------------------------------------------------------
/**
 * Load a locale's message file from `messagesDir/{locale}.json`.
 * Returns an empty object when the file is missing or unparseable.
 *
 * @param locale      - e.g. `'it'`
 * @param messagesDir - absolute path to the directory containing the JSON files
 */
export async function loadMessages(locale, messagesDir) {
    const file = path.join(messagesDir, `${locale}.json`);
    try {
        const raw = await fs.readFile(file, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return flattenMessages(parsed);
        }
        return {};
    }
    catch {
        return {};
    }
}
/** Recursively flatten `{ a: { b: 'text' } }` → `{ 'a.b': 'text' }`. */
function flattenMessages(obj, prefix = '') {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            Object.assign(out, flattenMessages(val, full));
        }
        else {
            out[full] = String(val);
        }
    }
    return out;
}
// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------
/**
 * Build a `t(key, vars?)` translator from a flat messages dictionary.
 *
 * Supports `{variable}` interpolation:
 *   `t('greeting', { name: 'World' })` with `"greeting": "Hello, {name}!"` → `"Hello, World!"`
 *
 * Falls back to the key itself when the message is not found.
 */
export function createTranslator(messages) {
    return function t(key, vars) {
        let msg = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
        if (vars) {
            for (const [k, v] of Object.entries(vars)) {
                msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
            }
        }
        return msg;
    };
}

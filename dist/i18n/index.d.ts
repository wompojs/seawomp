import { type RenderHtml } from 'wompo';
export { detectClientLocale, getActiveSsrLocale, getClientI18nConfig, localizeHref, setActiveSsrLocale, setClientI18nConfig, } from './context.js';
export type { LocaleContextValue } from './context.js';
export interface I18nConfig {
    /** All supported locale codes, e.g. `['en', 'it', 'fr']`. */
    locales: string[];
    /** The locale used when no prefix is present in the URL. */
    defaultLocale: string;
    /** Redirect unprefixed page requests to the user's browser locale when supported. */
    detectBrowserLocale?: boolean;
}
/** Dictionary returned by `loadMessages` / stored in loader data. */
export type Messages = Record<string, string>;
/** The `t(key, vars?)` function returned by `createTranslator`. */
export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;
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
export declare function getLocale(url: URL, config: I18nConfig): string;
/** Whether a pathname starts with a supported locale prefix. */
export declare function hasLocalePrefix(pathname: string, config: I18nConfig): boolean;
/**
 * Strip the locale prefix from a pathname, if present.
 * The default locale never has a prefix, so `/about` is returned unchanged.
 *
 * @example
 *   stripLocalePrefix('/it/about', 'it', 'en')  // → '/about'
 *   stripLocalePrefix('/about', 'en', 'en')      // → '/about'
 *   stripLocalePrefix('/it', 'it', 'en')         // → '/'
 */
export declare function stripLocalePrefix(pathname: string, locale: string, defaultLocale: string): string;
/**
 * Add a locale prefix to a pathname.
 * The default locale gets no prefix.
 *
 * @example
 *   localizeUrl('/about', 'it', 'en')  // → '/it/about'
 *   localizeUrl('/about', 'en', 'en')  // → '/about'
 *   localizeUrl('/', 'it', 'en')       // → '/it'
 */
export declare function localizeUrl(pathname: string, locale: string, defaultLocale: string): string;
/** Pick the best supported locale from an Accept-Language header. */
export declare function preferredLocaleFromAcceptLanguage(acceptLanguage: string | null, config: I18nConfig): string;
/**
 * Build a map of `{ locale → localizedUrl }` for all configured locales.
 * Useful for rendering hreflang links in the `<head>`.
 *
 * @example
 *   alternateUrls('/about', { locales: ['en', 'it'], defaultLocale: 'en' })
 *   // → { en: '/about', it: '/it/about' }
 */
export declare function alternateUrls(pathname: string, config: I18nConfig): Record<string, string>;
export interface SeoI18nHeadOptions {
    siteUrl: string;
    pathname: string;
    i18n: I18nConfig;
    /** Active locale. Inferred from pathname when omitted. */
    locale?: string;
    /** Locale used for x-default. Defaults to i18n.defaultLocale. */
    xDefaultLocale?: string;
    /** Override canonical pathname. Defaults to pathname. */
    canonicalPathname?: string;
    /** Map short locale codes to Open Graph locale values, e.g. `{ en: 'en_US' }`. */
    ogLocale?: Record<string, string>;
}
/** Generate canonical, hreflang, og:url and og:locale tags for localized routes. */
export declare function seoI18nHead(options: SeoI18nHeadOptions): RenderHtml;
/**
 * Load a locale's message file from `messagesDir/{locale}.json`.
 * Returns an empty object when the file is missing or unparseable.
 *
 * @param locale      - e.g. `'it'`
 * @param messagesDir - absolute path to the directory containing the JSON files
 */
export declare function loadMessages(locale: string, messagesDir: string): Promise<Messages>;
/**
 * Build a `t(key, vars?)` translator from a flat messages dictionary.
 *
 * Supports `{variable}` interpolation:
 *   `t('greeting', { name: 'World' })` with `"greeting": "Hello, {name}!"` → `"Hello, World!"`
 *
 * Falls back to the key itself when the message is not found.
 */
export declare function createTranslator(messages: Messages): TranslateFn;

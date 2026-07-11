import type { I18nConfig } from './index.js';
/** Translated route pathnames, keyed by canonical (default-locale) path:
 * `{ '/projects': { it: '/progetti' } }`. See `I18nConfig.routes`. */
export type I18nRouteMap = Record<string, Partial<Record<string, string>>>;
export interface LocaleContextValue {
    locale: string;
    defaultLocale: string;
    locales: string[];
    routes?: I18nRouteMap;
}
/** Push an active locale onto the SSR stack. Returns a disposer that pops it. */
export declare function setActiveSsrLocale(value: LocaleContextValue): () => void;
export declare function getActiveSsrLocale(): LocaleContextValue | null;
/** Push an active request pathname onto the SSR stack. Returns a disposer that pops it. Lets
 * built-in components (notably <seawomp-link>) auto-resolve `aria-current` server-side by
 * comparing the resolved href against the page being rendered. */
export declare function setActiveSsrPath(pathname: string): () => void;
export declare function getActiveSsrPath(): string | null;
/** Called by the client router bootstrap so components can localize hrefs. */
export declare function setClientI18nConfig(config: I18nConfig | null): void;
export declare function getClientI18nConfig(): I18nConfig | null;
/** Inspect the live DOM (client only) to determine the active locale. Falls back to
 * the configured defaultLocale, or `'en'` when no config is registered. */
export declare function detectClientLocale(): string;
/** Pure URL helper — prefix `href` with `/locale` when `locale !== defaultLocale`,
 * stripping any existing locale prefix first. When a `routes` translation map is provided,
 * the pathname is also translated (`/projects` → `/progetti` for `locale: 'it'`), and an
 * already-localized href is untranslated back to canonical before re-localizing. Returns
 * external URLs unchanged. */
export declare function localizeHref(href: string, locale: string, defaultLocale: string, locales: string[], routes?: I18nRouteMap): string;
/** Translate a canonical (default-locale) pathname into its localized variant using the
 * `i18n.routes` map. No locale prefix is added. The longest matching canonical prefix wins,
 * so nested paths inherit parent mappings: with `{ '/projects': { it: '/progetti' } }`,
 * `/projects/alpha` translates to `/progetti/alpha`. Unmapped paths pass through unchanged. */
export declare function translateRoutePath(pathname: string, locale: string, defaultLocale: string, routes?: I18nRouteMap): string;
/** Inverse of `translateRoutePath`: map a localized pathname (already stripped of its locale
 * prefix) back to the canonical default-locale pathname routes are matched against. */
export declare function untranslateRoutePath(pathname: string, locale: string, defaultLocale: string, routes?: I18nRouteMap): string;

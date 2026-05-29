import type { I18nConfig } from './index.js';
export interface LocaleContextValue {
    locale: string;
    defaultLocale: string;
    locales: string[];
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
 * stripping any existing locale prefix first. Returns external URLs unchanged. */
export declare function localizeHref(href: string, locale: string, defaultLocale: string, locales: string[]): string;

/* Shared locale state for built-in seawomp components (in particular <seawomp-link>).
 *
 * Why not a wompo Context: the seawomp built-in components are loaded by the host app
 * and may resolve a *different* wompo module instance than the one that runs SSR (e.g.
 * with --preserve-symlinks across symlinked workspaces). Reading wompo state across
 * module instances throws. Instead, the SSR pipeline (render-page) calls
 * `setActiveSsrLocale` before each render and `clearActiveSsrLocale` after, and the
 * client runtime calls `setClientI18nConfig` during bootstrap. Components read these
 * module-level values without ever entering wompo's hook system on the server.
 *
 * SSR is single-threaded, but renderToStream is async — `setActiveSsrLocale` returns a
 * disposer that the caller must invoke after the render to keep the active value scoped.
 */
import type { I18nConfig } from './index.js';

export interface LocaleContextValue {
	locale: string;
	defaultLocale: string;
	locales: string[];
}

const ssrLocaleStack: LocaleContextValue[] = [];

/** Push an active locale onto the SSR stack. Returns a disposer that pops it. */
export function setActiveSsrLocale(value: LocaleContextValue): () => void {
	ssrLocaleStack.push(value);
	return () => {
		const idx = ssrLocaleStack.lastIndexOf(value);
		if (idx >= 0) ssrLocaleStack.splice(idx, 1);
	};
}

export function getActiveSsrLocale(): LocaleContextValue | null {
	return ssrLocaleStack.length ? ssrLocaleStack[ssrLocaleStack.length - 1] : null;
}

let clientI18nConfig: I18nConfig | null = null;

/** Called by the client router bootstrap so components can localize hrefs. */
export function setClientI18nConfig(config: I18nConfig | null): void {
	clientI18nConfig = config;
}

export function getClientI18nConfig(): I18nConfig | null {
	return clientI18nConfig;
}

/** Inspect the live DOM (client only) to determine the active locale. Falls back to
 * the configured defaultLocale, or `'en'` when no config is registered. */
export function detectClientLocale(): string {
	if (typeof document === 'undefined') {
		return clientI18nConfig?.defaultLocale ?? 'en';
	}
	const config = clientI18nConfig;
	if (config) {
		const first = window.location.pathname.split('/').filter(Boolean)[0];
		if (first && config.locales.includes(first)) return first;
		const lang = document.documentElement.lang;
		if (lang && config.locales.includes(lang)) return lang;
		return config.defaultLocale;
	}
	return document.documentElement.lang || 'en';
}

/** Pure URL helper — prefix `href` with `/locale` when `locale !== defaultLocale`,
 * stripping any existing locale prefix first. Returns external URLs unchanged. */
export function localizeHref(
	href: string,
	locale: string,
	defaultLocale: string,
	locales: string[],
): string {
	if (!href) return href;
	if (/^([a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i.test(href)) return href;
	if (!href.startsWith('/')) return href;
	const first = href.split('/').filter(Boolean)[0];
	let stripped = href;
	if (first && locales.includes(first)) {
		const prefix = '/' + first;
		stripped = href === prefix ? '/' : href.slice(prefix.length);
	}
	if (locale === defaultLocale) return stripped;
	return stripped === '/' ? '/' + locale : '/' + locale + stripped;
}

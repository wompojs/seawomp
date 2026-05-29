/* Shared locale/path state for built-in seawomp components (in particular <seawomp-link>).
 *
 * Why not a wompo Context: the seawomp built-in components are loaded by the host app
 * and may resolve a *different* wompo module instance than the one that runs SSR (e.g.
 * with --preserve-symlinks across symlinked workspaces). Reading wompo state across
 * module instances throws. Instead, the SSR pipeline (render-page) calls
 * `setActiveSsrLocale`/`setActiveSsrPath` before each render (releasing after), and the
 * client runtime calls `setClientI18nConfig` during bootstrap. Components read these values
 * without ever entering wompo's hook system on the server.
 *
 * Why globalThis: the very same `--preserve-symlinks` setup that motivates this file also
 * splits *this* module — the dev/build CLI loads seawomp through the un-followed
 * `node_modules/seawomp` path while the app's own `import 'seawomp/...'` follows the symlink to
 * the real workspace path. Two absolute paths → two module instances → two sets of module-level
 * state, so a value set by the render pipeline would be invisible to the component reading it.
 * Stashing the stacks on `globalThis` makes every instance share one store (the same trick wompo
 * uses for its render context).
 *
 * SSR is single-threaded, but renderToStream is async — the setters return a disposer the caller
 * must invoke after the render to keep the active value scoped.
 */
import type { I18nConfig } from './index.js';

export interface LocaleContextValue {
	locale: string;
	defaultLocale: string;
	locales: string[];
}

interface SsrPathEntry {
	pathname: string;
}

interface SsrContextStore {
	localeStack: LocaleContextValue[];
	pathStack: SsrPathEntry[];
}

const SSR_CONTEXT_KEY = '__seawompSsrContext__';

function ssrStore(): SsrContextStore {
	const g = globalThis as Record<string, unknown>;
	let store = g[SSR_CONTEXT_KEY] as SsrContextStore | undefined;
	if (!store) {
		store = { localeStack: [], pathStack: [] };
		g[SSR_CONTEXT_KEY] = store;
	}
	return store;
}

/** Push an active locale onto the SSR stack. Returns a disposer that pops it. */
export function setActiveSsrLocale(value: LocaleContextValue): () => void {
	const stack = ssrStore().localeStack;
	stack.push(value);
	return () => {
		const idx = stack.lastIndexOf(value);
		if (idx >= 0) stack.splice(idx, 1);
	};
}

export function getActiveSsrLocale(): LocaleContextValue | null {
	const stack = ssrStore().localeStack;
	return stack.length ? stack[stack.length - 1] : null;
}

/** Push an active request pathname onto the SSR stack. Returns a disposer that pops it. Lets
 * built-in components (notably <seawomp-link>) auto-resolve `aria-current` server-side by
 * comparing the resolved href against the page being rendered. */
export function setActiveSsrPath(pathname: string): () => void {
	const stack = ssrStore().pathStack;
	const entry: SsrPathEntry = { pathname };
	stack.push(entry);
	return () => {
		const idx = stack.lastIndexOf(entry);
		if (idx >= 0) stack.splice(idx, 1);
	};
}

export function getActiveSsrPath(): string | null {
	const stack = ssrStore().pathStack;
	return stack.length ? stack[stack.length - 1].pathname : null;
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

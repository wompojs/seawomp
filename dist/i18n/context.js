const SSR_CONTEXT_KEY = '__seawompSsrContext__';
function ssrStore() {
    const g = globalThis;
    let store = g[SSR_CONTEXT_KEY];
    if (!store) {
        store = { localeStack: [], pathStack: [] };
        g[SSR_CONTEXT_KEY] = store;
    }
    return store;
}
/** Push an active locale onto the SSR stack. Returns a disposer that pops it. */
export function setActiveSsrLocale(value) {
    const stack = ssrStore().localeStack;
    stack.push(value);
    return () => {
        const idx = stack.lastIndexOf(value);
        if (idx >= 0)
            stack.splice(idx, 1);
    };
}
export function getActiveSsrLocale() {
    const stack = ssrStore().localeStack;
    return stack.length ? stack[stack.length - 1] : null;
}
/** Push an active request pathname onto the SSR stack. Returns a disposer that pops it. Lets
 * built-in components (notably <seawomp-link>) auto-resolve `aria-current` server-side by
 * comparing the resolved href against the page being rendered. */
export function setActiveSsrPath(pathname) {
    const stack = ssrStore().pathStack;
    const entry = { pathname };
    stack.push(entry);
    return () => {
        const idx = stack.lastIndexOf(entry);
        if (idx >= 0)
            stack.splice(idx, 1);
    };
}
export function getActiveSsrPath() {
    const stack = ssrStore().pathStack;
    return stack.length ? stack[stack.length - 1].pathname : null;
}
let clientI18nConfig = null;
/** Called by the client router bootstrap so components can localize hrefs. */
export function setClientI18nConfig(config) {
    clientI18nConfig = config;
}
export function getClientI18nConfig() {
    return clientI18nConfig;
}
/** Inspect the live DOM (client only) to determine the active locale. Falls back to
 * the configured defaultLocale, or `'en'` when no config is registered. */
export function detectClientLocale() {
    if (typeof document === 'undefined') {
        return clientI18nConfig?.defaultLocale ?? 'en';
    }
    const config = clientI18nConfig;
    if (config) {
        const first = window.location.pathname.split('/').filter(Boolean)[0];
        if (first && config.locales.includes(first))
            return first;
        const lang = document.documentElement.lang;
        if (lang && config.locales.includes(lang))
            return lang;
        return config.defaultLocale;
    }
    return document.documentElement.lang || 'en';
}
/** Pure URL helper — prefix `href` with `/locale` when `locale !== defaultLocale`,
 * stripping any existing locale prefix first. Returns external URLs unchanged. */
export function localizeHref(href, locale, defaultLocale, locales) {
    if (!href)
        return href;
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i.test(href))
        return href;
    if (!href.startsWith('/'))
        return href;
    const first = href.split('/').filter(Boolean)[0];
    let stripped = href;
    if (first && locales.includes(first)) {
        const prefix = '/' + first;
        stripped = href === prefix ? '/' : href.slice(prefix.length);
    }
    if (locale === defaultLocale)
        return stripped;
    return stripped === '/' ? '/' + locale : '/' + locale + stripped;
}

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
 * stripping any existing locale prefix first. When a `routes` translation map is provided,
 * the pathname is also translated (`/projects` → `/progetti` for `locale: 'it'`), and an
 * already-localized href is untranslated back to canonical before re-localizing. Returns
 * external URLs unchanged. */
export function localizeHref(href, locale, defaultLocale, locales, routes) {
    if (!href)
        return href;
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i.test(href))
        return href;
    if (!href.startsWith('/'))
        return href;
    // Query/hash must not take part in path translation or prefixing.
    const suffixIdx = href.search(/[?#]/);
    const path = suffixIdx === -1 ? href : href.slice(0, suffixIdx);
    const suffix = suffixIdx === -1 ? '' : href.slice(suffixIdx);
    const first = path.split('/').filter(Boolean)[0];
    let stripped = path;
    if (first && locales.includes(first)) {
        const prefix = '/' + first;
        stripped = path === prefix ? '/' : path.slice(prefix.length);
        stripped = untranslateRoutePath(stripped, first, defaultLocale, routes);
    }
    const translated = translateRoutePath(stripped, locale, defaultLocale, routes);
    if (locale === defaultLocale)
        return translated + suffix;
    return (translated === '/' ? '/' + locale : '/' + locale + translated) + suffix;
}
// ---------------------------------------------------------------------------
// Route path translation (i18n.routes)
// ---------------------------------------------------------------------------
/** Translate a canonical (default-locale) pathname into its localized variant using the
 * `i18n.routes` map. No locale prefix is added. The longest matching canonical prefix wins,
 * so nested paths inherit parent mappings: with `{ '/projects': { it: '/progetti' } }`,
 * `/projects/alpha` translates to `/progetti/alpha`. Unmapped paths pass through unchanged. */
export function translateRoutePath(pathname, locale, defaultLocale, routes) {
    if (!routes || locale === defaultLocale)
        return pathname;
    return mapPathByPrefix(pathname, compileRouteMap(routes, locale).forward);
}
/** Inverse of `translateRoutePath`: map a localized pathname (already stripped of its locale
 * prefix) back to the canonical default-locale pathname routes are matched against. */
export function untranslateRoutePath(pathname, locale, defaultLocale, routes) {
    if (!routes || locale === defaultLocale)
        return pathname;
    return mapPathByPrefix(pathname, compileRouteMap(routes, locale).inverse);
}
const compiledRouteMaps = new WeakMap();
function compileRouteMap(routes, locale) {
    let byLocale = compiledRouteMaps.get(routes);
    if (!byLocale) {
        byLocale = new Map();
        compiledRouteMaps.set(routes, byLocale);
    }
    let compiled = byLocale.get(locale);
    if (!compiled) {
        compiled = { forward: new Map(), inverse: new Map() };
        for (const [canonicalRaw, translations] of Object.entries(routes)) {
            const translatedRaw = translations?.[locale];
            if (typeof translatedRaw !== 'string')
                continue;
            const canonical = normalizeRoutePathKey(canonicalRaw);
            const translated = normalizeRoutePathKey(translatedRaw);
            compiled.forward.set(canonical, translated);
            compiled.inverse.set(translated, canonical);
        }
        byLocale.set(locale, compiled);
    }
    return compiled;
}
function normalizeRoutePathKey(p) {
    let out = p.startsWith('/') ? p : '/' + p;
    if (out.length > 1 && out.endsWith('/'))
        out = out.slice(0, -1);
    return out;
}
/** Replace the longest mapped segment prefix of `pathname`; unmapped paths pass through. */
function mapPathByPrefix(pathname, mapping) {
    if (!mapping.size || !pathname.startsWith('/'))
        return pathname;
    const segments = pathname.split('/').filter(Boolean);
    for (let count = segments.length; count >= 1; count--) {
        const prefix = '/' + segments.slice(0, count).join('/');
        const mapped = mapping.get(prefix);
        if (mapped === undefined)
            continue;
        const rest = segments.slice(count).join('/');
        if (!rest)
            return mapped;
        return mapped === '/' ? '/' + rest : mapped + '/' + rest;
    }
    return pathname;
}

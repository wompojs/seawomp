import { type I18nRouteMap } from '../i18n/context.js';
export interface RouteRecord {
    pattern: string;
    page: string;
    layouts: string[];
}
export interface RouterI18nConfig {
    locales: string[];
    defaultLocale: string;
    detectBrowserLocale?: boolean;
    /** Translated route pathnames keyed by canonical path (see `I18nConfig.routes`). */
    routes?: I18nRouteMap;
}
export interface RouterViewTransitionOptions {
    /** Enable browser View Transitions for SPA navigations. Default: true. */
    enabled?: boolean;
    /** Optional class added to <html> for the duration of a transition, useful for custom CSS. */
    className?: string;
}
export interface RouterOptions {
    /** How long a successfully-prefetched HTML body stays warm. Default: 60 000 ms. */
    prefetchTtlMs?: number;
    /** Locale routing config. When set, client route matching strips locale prefixes. */
    i18n?: RouterI18nConfig;
    /** Browser View Transition behavior for SPA navigations. */
    viewTransitions?: boolean | RouterViewTransitionOptions;
}
export interface RouteSnapshot {
    href: string;
    pathname: string;
    search: string;
    hash: string;
    url: URL;
    params: Record<string, string>;
    route: RouteRecord | null;
}
/** Client chunk record for a special route (404 / error) — page + layout module URLs. Same shape
 * as a `RouteRecord` minus the URL pattern (special routes aren't matched by path). */
export interface SpecialRouteRecord {
    page: string;
    layouts: string[];
}
export interface SpecialRouteRecords {
    notFound: SpecialRouteRecord | null;
    error: SpecialRouteRecord | null;
}
/** Register the dev/build route table. Called once from the hydrate-entry bootstrap. */
export declare function setRoutes(rs: RouteRecord[]): void;
/** Register the 404 / error special-route chunk records. Called once from the hydrate-entry
 * bootstrap. A special-route document (404/error) has no matching entry in the normal route table,
 * so when the user navigates *away* from one the router can't tell whether the destination shares
 * the same layout shell — and defaults to replacing the whole `<body>`, which tears down and
 * recreates layout islands (e.g. a page-transition overlay island replays its mount animation,
 * producing a visible double transition). With these records the router recognizes the shared
 * layout chain via the live `data-seawomp-render` marker and swaps only the route-view instead. */
export declare function setSpecialRoutes(s: SpecialRouteRecords): void;
/** Tunable router knobs — call before any prefetches if you want to override defaults. */
export declare function setRouterOptions(opts: RouterOptions): void;
/** Drop the prefetch HTML cache. Mostly useful in tests. */
export declare function clearPrefetchCache(): void;
export declare function useRoute(initialHref?: string | URL): RouteSnapshot;
export declare function navigate(href: string): Promise<void>;
export declare function prefetchRoute(href: string, opts?: {
    preloadModules?: boolean;
}): void;
/** The layout chunk chain of the document we're navigating away from. Normal routes carry it in
 * their record; a 404/error document has no matching route record, so we fall back to the
 * registered special-route record identified by the live `data-seawomp-render` marker. Returns
 * null when the origin can't be identified — the caller then does a full-body swap.
 *
 * Exported for unit testing (it's DOM-free); not part of the public runtime API. */
export declare function currentLayoutsFor(currentRoute: RouteRecord | null, fromRenderKind: string | null | undefined): string[] | null;
export type NavigationState = 'idle' | 'loading';
export interface NavigationSnapshot {
    state: NavigationState;
    from?: URL;
    to?: URL;
}
/** Read the current navigation snapshot (no subscription). */
export declare function getNavigationSnapshot(): NavigationSnapshot;
/** Wompo hook — returns the current navigation snapshot and re-renders the component every time
 * the navigation state changes. Use it inside an island to render a skeleton/spinner while a
 * route transition is in flight. */
export declare function useNavigationState(): NavigationSnapshot;
/** Canonical (default-locale) pathname for a localized URL: locale prefix stripped and
 * translated slugs (i18n.routes) mapped back. This is the pathname the route table matches
 * against — used by the hydrate-entry bootstrap to pick the initial page module. Requires
 * `setRouterOptions({ i18n })` to have been called; without i18n it returns the input. */
export declare function canonicalPathname(pathname: string): string;

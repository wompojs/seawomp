export interface RouteRecord {
    pattern: string;
    page: string;
    layouts: string[];
}
export interface RouterI18nConfig {
    locales: string[];
    defaultLocale: string;
    detectBrowserLocale?: boolean;
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
/** Register the dev/build route table. Called once from the hydrate-entry bootstrap. */
export declare function setRoutes(rs: RouteRecord[]): void;
/** Tunable router knobs — call before any prefetches if you want to override defaults. */
export declare function setRouterOptions(opts: RouterOptions): void;
/** Drop the prefetch HTML cache. Mostly useful in tests. */
export declare function clearPrefetchCache(): void;
export declare function useRoute(initialHref?: string | URL): RouteSnapshot;
export declare function navigate(href: string): Promise<void>;
export declare function prefetchRoute(href: string, opts?: {
    preloadModules?: boolean;
}): void;
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

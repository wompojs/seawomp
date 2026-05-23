export interface RouteRecord {
    pattern: string;
    page: string;
    layouts: string[];
}
export interface RouterOptions {
    /** How long a successfully-prefetched HTML body stays warm. Default: 60 000 ms. */
    prefetchTtlMs?: number;
}
/** Register the dev/build route table. Called once from the hydrate-entry bootstrap. */
export declare function setRoutes(rs: RouteRecord[]): void;
/** Tunable router knobs — call before any prefetches if you want to override defaults. */
export declare function setRouterOptions(opts: RouterOptions): void;
/** Drop the prefetch HTML cache. Mostly useful in tests. */
export declare function clearPrefetchCache(): void;
export declare function navigate(href: string): Promise<void>;
export declare function prefetchRoute(href: string, opts?: {
    preloadModules?: boolean;
}): void;

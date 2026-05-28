export interface RouteEntry {
    /** Canonical URL pattern, e.g. `/blog/:id`. */
    pattern: string;
    /** Absolute path of the `page.ts` file. */
    pagePath: string;
    /** Layouts that wrap this page, outermost first. */
    layoutPaths: string[];
    /** Absolute path of an adjacent `loader.ts`, if any. */
    loaderPath?: string;
    /** Absolute path of the nearest `error.ts`. */
    errorPath?: string;
}
export interface SpecialRouteEntry {
    /** Absolute path of the special page module (`404.ts` or `error.ts`). */
    pagePath: string;
    /** Layouts that wrap this page, currently the root layout when present. */
    layoutPaths: string[];
}
export interface SpecialRoutes {
    notFoundRoute?: SpecialRouteEntry;
    errorRoute?: SpecialRouteEntry;
}
/** Scan an `app/` directory tree and return the discovered routes. */
export declare function scanRoutes(appDir: string): RouteEntry[];
export declare function scanSpecialRoutes(appDir: string): SpecialRoutes;

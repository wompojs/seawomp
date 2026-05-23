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
/** Scan an `app/` directory tree and return the discovered routes. */
export declare function scanRoutes(appDir: string): RouteEntry[];

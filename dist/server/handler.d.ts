import type { RouteEntry } from './routes.js';
import { type ApiRouteEntry } from './api-router.js';
export interface HandlerOptions {
    routes: RouteEntry[];
    /** Optional API routes — dispatched before page routes. */
    apiRoutes?: ApiRouteEntry[];
    loadModule: (absPath: string) => Promise<unknown>;
    hydrateScript?: string;
    title?: string;
    /** Tags injected into `<head>` (modulepreload, etc.). */
    headExtra?: string;
    /** App root used to resolve peer singletons for SSR. Defaults to process.cwd(). */
    cwd?: string;
}
export declare function createHandler(opts: HandlerOptions): (request: Request) => Promise<Response>;

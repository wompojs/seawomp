import type { RouteEntry, SpecialRouteEntry } from './routes.js';
import { type ApiRouteEntry } from './api-router.js';
import type { RedirectRule } from '../config.js';
import { type I18nConfig } from '../i18n/index.js';
export interface HandlerOptions {
    routes: RouteEntry[];
    /** Optional API routes — dispatched before page routes. */
    apiRoutes?: ApiRouteEntry[];
    loadModule: (absPath: string) => Promise<unknown>;
    hydrateScript?: string;
    title?: string;
    /** Framework-generated tags injected into `<head>` (discoverability, manifests, etc.). */
    frameworkHead?: string;
    /** App root used to resolve peer singletons for SSR. Defaults to process.cwd(). */
    cwd?: string;
    /** i18n config — when set, locale URL prefixes are stripped before route matching. */
    i18n?: I18nConfig;
    /** Static redirects evaluated before route matching. */
    redirects?: RedirectRule[];
    /** Optional `app/404.ts` route. */
    notFoundRoute?: SpecialRouteEntry;
    /** Optional global `app/error.ts` route. */
    errorRoute?: SpecialRouteEntry;
}
export declare function createHandler(opts: HandlerOptions): (request: Request) => Promise<Response>;

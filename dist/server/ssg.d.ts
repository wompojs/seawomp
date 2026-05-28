import type { RouteEntry, SpecialRouteEntry } from './routes.js';
import type { RedirectRule } from '../config.js';
export interface SsgOptions {
    routes: RouteEntry[];
    loadModule: (abs: string) => Promise<any>;
    outDir: string;
    origin?: string;
    hydrateScript?: string;
    title?: string;
    frameworkHead?: string;
    cwd?: string;
    redirects?: RedirectRule[];
    notFoundRoute?: SpecialRouteEntry;
    errorRoute?: SpecialRouteEntry;
    transformHtml?: (html: string, pathname: string) => string | Promise<string>;
}
export interface SsgResult {
    written: string[];
    paths: string[];
    skipped: {
        pattern: string;
        reason: string;
    }[];
}
export declare function prerender(opts: SsgOptions): Promise<SsgResult>;

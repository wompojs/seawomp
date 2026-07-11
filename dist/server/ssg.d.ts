import type { RouteEntry, SpecialRouteEntry } from './routes.js';
import type { RedirectRule } from '../config.js';
import { type I18nConfig } from '../i18n/index.js';
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
    /** When set, locale prefixes are stripped before route matching and static
     * `prerender = true` routes are emitted once per configured locale. */
    i18n?: I18nConfig;
    transformHtml?: (html: string, pathname: string) => string | Promise<string>;
}
export interface SsgResult {
    written: string[];
    paths: string[];
    /** Subset of `paths` eligible for sitemap.xml / sitemap.txt / llms.txt: excludes routes
     * exporting `sitemap = false` and pages whose rendered HTML carries a robots noindex meta. */
    sitemapPaths: string[];
    skipped: {
        pattern: string;
        reason: string;
    }[];
}
export declare function prerender(opts: SsgOptions): Promise<SsgResult>;
/** Whether the rendered document opts out of indexing via `<meta name="robots">` whose
 * content includes the `noindex` (or `none`) directive. Such pages must not be listed in
 * the sitemap — a noindex URL in sitemap.xml is a contradictory signal for crawlers. */
export declare function hasNoindexMeta(html: string): boolean;

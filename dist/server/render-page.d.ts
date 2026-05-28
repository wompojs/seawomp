import type { PageProps } from '../types.js';
import type { RouteEntry } from './routes.js';
import type { I18nConfig } from '../i18n/index.js';
export interface RenderPageInput {
    route: RouteEntry;
    /** Parsed params from the URL match (after applying the route regex). */
    params: Record<string, string>;
    /** The original Fetch-API Request. */
    request: Request;
    /** Module loader injected by the host (Vite dev or built ESM). */
    loadModule: (absPath: string) => Promise<unknown>;
    /** App root used to resolve peer singletons such as wompo. */
    cwd: string;
    /** i18n config — when provided, the active locale is registered for built-in components
     * (notably <seawomp-link>) to use for href localization. */
    i18n?: I18nConfig;
}
export interface RenderPageOutput {
    body: ReadableStream<Uint8Array>;
    /** HTML fragment to inject into <head>: the result of `pageMod.head(props)` with each
     * top-level element tagged `data-seawomp-head` so SPA navigation can swap it in place. */
    head: string;
}
export interface RenderModuleInput {
    /** Absolute path of the page-like module to render. */
    pagePath: string;
    /** Layouts that wrap this module, outermost first. */
    layoutPaths: string[];
    /** Props passed to the rendered module and its layouts. */
    props: PageProps & Record<string, unknown>;
    /** Module loader injected by the host. */
    loadModule: (absPath: string) => Promise<unknown>;
    /** App root used to resolve peer singletons such as wompo. */
    cwd: string;
    /** i18n config — when provided, the active locale is registered for built-in components
     * (notably <seawomp-link>) to use for href localization. */
    i18n?: I18nConfig;
}
export declare function renderRouteToStream(input: RenderPageInput): Promise<RenderPageOutput>;
export declare function renderModuleToStream(input: RenderModuleInput): Promise<RenderPageOutput>;

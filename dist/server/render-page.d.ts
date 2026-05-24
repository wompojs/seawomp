import type { RouteEntry } from './routes.js';
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
}
export interface RenderPageOutput {
    body: ReadableStream<Uint8Array>;
    /** HTML fragment to inject into <head>: the result of `pageMod.head(props)` with each
     * top-level element tagged `data-seawomp-head` so SPA navigation can swap it in place. */
    head: string;
}
export declare function renderRouteToStream(input: RenderPageInput): Promise<RenderPageOutput>;

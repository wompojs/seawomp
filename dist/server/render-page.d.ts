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
export declare function renderRouteToStream(input: RenderPageInput): Promise<ReadableStream<Uint8Array>>;

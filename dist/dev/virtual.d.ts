import type { RouteEntry } from '../server/routes.js';
/** Convert an absolute file path to the dev URL the source-server exposes. */
export declare function srcUrl(abs: string): string;
/** Build the hydrate-entry JS. Inlines the route table + the HMR client snippet. */
export declare function buildHydrateEntry(routes: RouteEntry[]): string;

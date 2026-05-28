import type { RouteEntry } from './routes.js';
import type { ImageVariant } from '../build/images.js';
export interface RouteManifestEntry {
    pattern: string;
    page: string;
    layouts: string[];
    loader?: string;
    error?: string;
    serverPage?: string;
    serverLayouts?: string[];
    serverLoader?: string;
    serverError?: string;
    css: string[];
}
export interface ApiManifestEntry {
    pattern: string;
    modulePath: string;
    serverModulePath?: string;
}
export interface SpecialRouteManifestEntry {
    page: string;
    layouts: string[];
    serverPage?: string;
    serverLayouts?: string[];
}
export interface BuildManifest {
    routes: RouteManifestEntry[];
    apiRoutes: ApiManifestEntry[];
    islands: Record<string, string>;
    hydrateRuntime: string;
    /** Image variant map (original URL → list of `{ src, type, width }`). */
    images: Record<string, ImageVariant[]>;
    /** Build-time framework head fragments, such as discoverability links. */
    head?: {
        framework?: string;
    };
    notFoundRoute?: SpecialRouteManifestEntry;
    errorRoute?: SpecialRouteManifestEntry;
}
export declare function emptyManifest(): BuildManifest;
export declare function manifestFromRoutes(routes: RouteEntry[]): BuildManifest;
/** Serialize the manifest to JSON suitable for writing to disk. */
export declare function serializeManifest(m: BuildManifest): string;

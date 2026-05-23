/* Build output manifest.
 *
 * Maps each route pattern to its asset list (page chunk, layouts, CSS files) and each known
 * island tag to the chunk URL that defines its component. The runtime reads this map (injected
 * as `window.__SEAWOMP_ISLANDS`) to dynamically import island chunks on demand. The image
 * sub-manifest is injected as `window.__SEAWOMP_IMAGES` so `<seawomp-image>` can build srcset.
 */
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

export interface BuildManifest {
	routes: RouteManifestEntry[];
	apiRoutes: ApiManifestEntry[];
	islands: Record<string, string>;
	hydrateRuntime: string;
	/** Hashed URL of the minified global CSS, when present. */
	global: { css?: string };
	/** Image variant map (original URL → list of `{ src, type, width }`). */
	images: Record<string, ImageVariant[]>;
}

export function emptyManifest(): BuildManifest {
	return {
		routes: [],
		apiRoutes: [],
		islands: {},
		hydrateRuntime: '/_hydrate.js',
		global: {},
		images: {},
	};
}

export function manifestFromRoutes(routes: RouteEntry[]): BuildManifest {
	return {
		routes: routes.map((r) => ({
			pattern: r.pattern,
			page: r.pagePath,
			layouts: r.layoutPaths,
			css: [],
		})),
		apiRoutes: [],
		islands: {},
		hydrateRuntime: '/_hydrate.js',
		global: {},
		images: {},
	};
}

/** Serialize the manifest to JSON suitable for writing to disk. */
export function serializeManifest(m: BuildManifest): string {
	return JSON.stringify(m, null, 2);
}

export function emptyManifest() {
    return {
        routes: [],
        apiRoutes: [],
        islands: {},
        hydrateRuntime: '/_hydrate.js',
        global: {},
        images: {},
    };
}
export function manifestFromRoutes(routes) {
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
export function serializeManifest(m) {
    return JSON.stringify(m, null, 2);
}

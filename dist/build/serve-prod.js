/* Production server — `seawomp start`.
 *
 * Reads the build manifest, serves `.seawomp/static/_assets/*` statically, and dispatches
 * dynamic routes through `createHandler` with `loadModule` pointing at the server bundles
 * in `.seawomp/server/`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHandler } from '../server/handler.js';
import { scanRoutes, scanSpecialRoutes, } from '../server/routes.js';
import { scanApiRoutes } from '../server/api-router.js';
import { compressResponseBody, serveStatic } from '../server/static.js';
import { compileRedirects, matchRedirect } from '../server/redirects.js';
import { postProcessHtml } from './html-postprocess.js';
import { discoverabilityHeadTags } from './discoverability.js';
export async function loadBuildManifest(cfg) {
    let manifest;
    try {
        const raw = await fs.readFile(path.join(cfg.outDir, 'manifest.json'), 'utf-8');
        manifest = JSON.parse(raw);
    }
    catch (err) {
        throw new Error(`[seawomp] could not read manifest at ${cfg.outDir}/manifest.json — did you run \`seawomp build\`?`);
    }
    return manifest;
}
export async function createProdHandler(cfg, cwd) {
    const manifest = await loadBuildManifest(cfg);
    const staticDir = path.join(cfg.outDir, 'static');
    const { routes, apiRoutes, notFoundRoute, errorRoute } = resolveServerRoutes(manifest, cfg, cwd);
    const redirects = compileRedirects(cfg.redirects);
    // Build framework head: discoverability links + image manifest globals.
    let frameworkHead = manifest.head?.framework ?? discoverabilityHeadTags(cfg.discoverability);
    if (manifest.images && Object.keys(manifest.images).length) {
        frameworkHead += `<script>window.__SEAWOMP_IMAGES=${JSON.stringify(manifest.images)};</script>`;
    }
    const dispatch = createHandler({
        routes,
        apiRoutes,
        loadModule: (abs) => import(abs),
        title: cfg.title,
        frameworkHead,
        hydrateScript: manifest.hydrateRuntime,
        cwd,
        i18n: cfg.i18n,
        redirects: cfg.redirects,
        notFoundRoute,
        errorRoute,
    });
    return async (req) => {
        const url = new URL(req.url);
        const pathname = url.pathname;
        const redirect = matchRedirect(pathname, url.search, redirects);
        if (redirect)
            return redirect;
        // 1) Static assets under /_assets/ (and anything else with an extension).
        if (pathname.startsWith('/_assets/') || /\.[a-z0-9]+$/i.test(pathname)) {
            const r = await serveStatic(staticDir, pathname, { request: req, mode: 'prod' });
            if (r)
                return r;
            const pub = await serveStatic(cfg.publicDir, pathname, { request: req, mode: 'prod' });
            if (pub)
                return pub;
        }
        // 2) Prerendered HTML (SSG output).
        const ssgHtml = await serveStatic(staticDir, pathname === '/' ? '/index.html' : pathname + '/index.html', { request: req, mode: 'prod' });
        if (ssgHtml)
            return ssgHtml;
        // 3) Dynamic SSR / API.
        try {
            const resp = await dispatch(req);
            if (resp.headers.get('content-type')?.startsWith('text/html')) {
                const body = await resp.text();
                const headers = new Headers(resp.headers);
                const processed = postProcessHtml(body, { minify: cfg.minify.html, optimizeLcp: true });
                return new Response(compressResponseBody(new TextEncoder().encode(processed), headers.get('content-type'), req, headers), { status: resp.status, headers });
            }
            return resp;
        }
        catch (err) {
            console.error('[seawomp] handler error:', err);
            return new Response(String(err), { status: 500 });
        }
    };
}
export async function startProd(cfg, cwd) {
    const handler = await createProdHandler(cfg, cwd);
    const server = Bun.serve({
        port: cfg.port,
        fetch: handler,
    });
    console.log(`\n  seawomp start → http://localhost:${server.port}\n`);
}
function resolveServerRoutes(manifest, cfg, cwd) {
    if (manifest.routes.some((r) => r.serverPage) ||
        manifest.apiRoutes.some((r) => r.serverModulePath) ||
        !!manifest.notFoundRoute?.serverPage ||
        !!manifest.errorRoute?.serverPage) {
        return {
            routes: manifest.routes.map((r) => ({
                pattern: r.pattern,
                pagePath: resolveOutDirPath(cfg.outDir, r.serverPage ?? mapToServerBundle(cwd, cfg.outDir, r.page)),
                layoutPaths: (r.serverLayouts ?? r.layouts.map((p) => mapToServerBundle(cwd, cfg.outDir, p))).map((p) => resolveOutDirPath(cfg.outDir, p)),
                loaderPath: r.serverLoader
                    ? resolveOutDirPath(cfg.outDir, r.serverLoader)
                    : r.loader
                        ? resolveOutDirPath(cfg.outDir, mapToServerBundle(cwd, cfg.outDir, r.loader))
                        : undefined,
                errorPath: r.serverError
                    ? resolveOutDirPath(cfg.outDir, r.serverError)
                    : r.error
                        ? resolveOutDirPath(cfg.outDir, mapToServerBundle(cwd, cfg.outDir, r.error))
                        : undefined,
            })),
            apiRoutes: manifest.apiRoutes.map((r) => ({
                pattern: r.pattern,
                modulePath: resolveOutDirPath(cfg.outDir, r.serverModulePath ?? mapToServerBundle(cwd, cfg.outDir, r.modulePath)),
            })),
            notFoundRoute: resolveSpecialRoute(manifest.notFoundRoute, cfg, cwd),
            errorRoute: resolveSpecialRoute(manifest.errorRoute, cfg, cwd),
        };
    }
    const sourceRoutes = scanRoutes(cfg.appDir);
    const sourceApiRoutes = scanApiRoutes(cfg.appDir);
    const specialRoutes = scanSpecialRoutes(cfg.appDir);
    return {
        routes: sourceRoutes.map((r) => ({
            ...r,
            pagePath: mapToServerBundle(cwd, cfg.outDir, r.pagePath),
            layoutPaths: r.layoutPaths.map((p) => mapToServerBundle(cwd, cfg.outDir, p)),
            loaderPath: r.loaderPath ? mapToServerBundle(cwd, cfg.outDir, r.loaderPath) : undefined,
            errorPath: r.errorPath ? mapToServerBundle(cwd, cfg.outDir, r.errorPath) : undefined,
        })),
        apiRoutes: sourceApiRoutes.map((r) => ({
            ...r,
            modulePath: mapToServerBundle(cwd, cfg.outDir, r.modulePath),
        })),
        notFoundRoute: mapSpecialRoute(specialRoutes.notFoundRoute, cwd, cfg.outDir),
        errorRoute: mapSpecialRoute(specialRoutes.errorRoute, cwd, cfg.outDir),
    };
}
function resolveSpecialRoute(route, cfg, cwd) {
    if (!route)
        return undefined;
    return {
        pagePath: resolveOutDirPath(cfg.outDir, route.serverPage ?? mapToServerBundle(cwd, cfg.outDir, route.page)),
        layoutPaths: (route.serverLayouts ?? route.layouts.map((p) => mapToServerBundle(cwd, cfg.outDir, p)))
            .map((p) => resolveOutDirPath(cfg.outDir, p)),
    };
}
function mapSpecialRoute(route, cwd, outDir) {
    if (!route)
        return undefined;
    return {
        pagePath: mapToServerBundle(cwd, outDir, route.pagePath),
        layoutPaths: route.layoutPaths.map((p) => mapToServerBundle(cwd, outDir, p)),
    };
}
function resolveOutDirPath(outDir, p) {
    return path.isAbsolute(p) ? p : path.join(outDir, p);
}
function mapToServerBundle(cwd, outDir, abs) {
    const serverDir = path.join(outDir, 'server');
    const rel = path.relative(cwd, abs);
    const noExt = rel.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '.js');
    return path.join(serverDir, noExt);
}

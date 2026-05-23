/* Production server — `seawomp start`.
 *
 * Reads the build manifest, serves `.seawomp/static/_assets/*` statically, and dispatches
 * dynamic routes through `createHandler` with `loadModule` pointing at the server bundles
 * in `.seawomp/server/`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHandler } from '../server/handler.js';
import { scanRoutes } from '../server/routes.js';
import { scanApiRoutes } from '../server/api-router.js';
import { serveStatic } from '../server/static.js';
import { minifyHtmlShell } from './minify-html.js';
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
    const { routes, apiRoutes } = resolveServerRoutes(manifest, cfg, cwd);
    // Build head extra: global CSS link tag + image manifest globals + user headExtra.
    let headExtra = cfg.headExtra ?? '';
    if (manifest.global.css) {
        headExtra = `<link rel="stylesheet" href="${manifest.global.css}">` + headExtra;
    }
    if (manifest.images && Object.keys(manifest.images).length) {
        headExtra += `<script>window.__SEAWOMP_IMAGES=${JSON.stringify(manifest.images)};</script>`;
    }
    const dispatch = createHandler({
        routes,
        apiRoutes,
        loadModule: (abs) => import(abs),
        title: cfg.title,
        headExtra,
        cwd,
    });
    return async (req) => {
        const url = new URL(req.url);
        const pathname = url.pathname;
        // 1) Static assets under /_assets/ (and anything else with an extension).
        if (pathname.startsWith('/_assets/') || /\.[a-z0-9]+$/i.test(pathname)) {
            const r = await serveStatic(staticDir, pathname);
            if (r)
                return r;
            const pub = await serveStatic(cfg.publicDir, pathname);
            if (pub)
                return pub;
        }
        // 2) Prerendered HTML (SSG output).
        const ssgHtml = await serveStatic(staticDir, pathname === '/' ? '/index.html' : pathname + '/index.html');
        if (ssgHtml)
            return ssgHtml;
        // 3) Dynamic SSR / API.
        try {
            const resp = await dispatch(req);
            // Only minify HTML responses, and only when configured.
            if (cfg.minify.html && resp.headers.get('content-type')?.startsWith('text/html')) {
                const body = await resp.text();
                return new Response(minifyHtmlShell(body), { status: resp.status, headers: resp.headers });
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
        manifest.apiRoutes.some((r) => r.serverModulePath)) {
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
        };
    }
    const sourceRoutes = scanRoutes(cfg.appDir);
    const sourceApiRoutes = scanApiRoutes(cfg.appDir);
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

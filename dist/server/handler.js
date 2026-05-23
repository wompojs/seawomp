/* Fetch-style request handler for both dev (Bun.serve) and prod (built ESM).
 *
 * Given a request and a route table, picks the best match, runs the loader, renders the page
 * via the SSR streaming pipeline, and returns a Response whose body is the composed HTML stream.
 * The host provides the `loadModule` hook so we remain agnostic of how route modules end up in
 * memory.
 *
 * Dispatch order:
 *   1. Server actions (`POST /_action/...`)
 *   2. API routes (`app/api/**\/route.ts`)
 *   3. Page routes (`app/.../page.ts`)
 *   4. 404
 */
import { compileRoutePattern } from '../shared/paths.js';
import { renderRouteToStream } from './render-page.js';
import { dispatchAction, isActionRequest } from './action-handler.js';
import { closeShell, openShell } from './html.js';
import { compileApiRoutes, dispatchApi } from './api-router.js';
function compile(routes) {
    return routes.map((r) => ({ ...r, ...compileRoutePattern(r.pattern) }));
}
export function createHandler(opts) {
    const compiled = compile(opts.routes);
    const compiledApi = compileApiRoutes(opts.apiRoutes ?? []);
    return async (request) => {
        const url = new URL(request.url);
        const pathname = url.pathname;
        // Server-action endpoint (precedes route matching so it can't collide with a page route).
        if (request.method === 'POST' && isActionRequest(pathname)) {
            return dispatchAction(request, { cwd: opts.cwd ?? process.cwd() });
        }
        // API routes — dispatch before pages so /api/foo can't be shadowed by a page.
        if (compiledApi.length) {
            const apiResp = await dispatchApi(request, compiledApi, opts.loadModule);
            if (apiResp)
                return apiResp;
        }
        for (const r of compiled) {
            const m = pathname.match(r.regex);
            if (!m)
                continue;
            const params = {};
            r.paramNames.forEach((name, i) => {
                params[name] = decodeURIComponent(m[i + 1] || '');
            });
            const bodyStream = await renderRouteToStream({
                route: r,
                params,
                request,
                loadModule: opts.loadModule,
                cwd: opts.cwd ?? process.cwd(),
            });
            return new Response(wrapStream(bodyStream, {
                title: opts.title,
                headExtra: opts.headExtra,
                hydrateScript: opts.hydrateScript,
            }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        return new Response('Not Found', { status: 404 });
    };
}
/** Prefix the streamed body with the doctype/head opener and suffix with the closing tags. */
function wrapStream(inner, opts) {
    const enc = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            controller.enqueue(enc.encode(openShell({
                title: opts.title,
                headExtra: opts.headExtra,
                hydrateScript: opts.hydrateScript,
            })));
            const reader = inner.getReader();
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                if (value)
                    controller.enqueue(value);
            }
            controller.enqueue(enc.encode(closeShell(opts.hydrateScript)));
            controller.close();
        },
    });
}

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
import { renderModuleToStream, renderRouteToStream } from './render-page.js';
import { dispatchAction, isActionRequest } from './action-handler.js';
import { closeShell, openShell } from './html.js';
import { compileApiRoutes, dispatchApi } from './api-router.js';
import { compileRedirects, matchRedirect } from './redirects.js';
import { isNotFoundSignal, isRedirectSignal, redirectResponse, } from './http.js';
import { getLocale, hasLocalePrefix, localizeUrl, preferredLocaleFromAcceptLanguage, stripLocalePrefix, } from '../i18n/index.js';
function compile(routes) {
    return routes.map((r) => ({ ...r, ...compileRoutePattern(r.pattern) }));
}
export function createHandler(opts) {
    const compiled = compile(opts.routes);
    const compiledApi = compileApiRoutes(opts.apiRoutes ?? []);
    const redirects = compileRedirects(opts.redirects ?? []);
    return async (request) => {
        const url = new URL(request.url);
        const rawPathname = url.pathname;
        const configuredRedirect = matchRedirect(rawPathname, url.search, redirects);
        if (configuredRedirect)
            return configuredRedirect;
        // Locale detection: when i18n is configured, extract the locale from the URL prefix and
        // strip it before route matching. The original URL (with prefix) is still passed to loaders.
        const locale = opts.i18n ? getLocale(url, opts.i18n) : undefined;
        const browserLocaleRedirect = getBrowserLocaleRedirect(request, url, opts.i18n, locale);
        if (browserLocaleRedirect)
            return browserLocaleRedirect;
        const pathname = locale && opts.i18n
            ? stripLocalePrefix(rawPathname, locale, opts.i18n.defaultLocale)
            : rawPathname;
        // Server-action endpoint (precedes route matching so it can't collide with a page route).
        if (request.method === 'POST' && isActionRequest(pathname)) {
            try {
                return await dispatchAction(request, { cwd: opts.cwd ?? process.cwd() });
            }
            catch (err) {
                return handleThrown(err, opts, undefined, {}, request, url, locale);
            }
        }
        // API routes — dispatch before pages so /api/foo can't be shadowed by a page.
        if (compiledApi.length) {
            let apiResp;
            try {
                apiResp = await dispatchApi(request, compiledApi, opts.loadModule);
            }
            catch (err) {
                return handleThrown(err, opts, undefined, {}, request, url, locale);
            }
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
            try {
                const rendered = await renderRouteToStream({
                    route: r,
                    params,
                    request,
                    loadModule: opts.loadModule,
                    cwd: opts.cwd ?? process.cwd(),
                    i18n: opts.i18n,
                });
                return htmlResponse(rendered, 200, opts, locale);
            }
            catch (err) {
                return handleThrown(err, opts, r, params, request, url, locale);
            }
        }
        return renderNotFound(opts, request, url, locale);
    };
}
async function handleThrown(err, opts, route, params, request, url, locale) {
    if (isRedirectSignal(err))
        return redirectResponse(err);
    if (isNotFoundSignal(err))
        return renderNotFound(opts, request, url, locale);
    return renderError(opts, route, params, request, url, locale, err);
}
async function renderNotFound(opts, request, url, locale) {
    if (!opts.notFoundRoute)
        return new Response('Not Found', { status: 404 });
    try {
        const rendered = await renderModuleToStream({
            pagePath: opts.notFoundRoute.pagePath,
            layoutPaths: opts.notFoundRoute.layoutPaths,
            props: { params: {}, data: undefined, url, status: 404 },
            loadModule: opts.loadModule,
            cwd: opts.cwd ?? process.cwd(),
            i18n: opts.i18n,
        });
        return htmlResponse(rendered, 404, opts, locale);
    }
    catch (err) {
        if (isRedirectSignal(err))
            return redirectResponse(err);
        console.error('[seawomp] 404 page error:', err);
        return new Response('Not Found', { status: 404 });
    }
}
async function renderError(opts, route, params, request, url, locale, err) {
    const errorRoute = route?.errorPath
        ? { pagePath: route.errorPath, layoutPaths: route.layoutPaths }
        : opts.errorRoute;
    if (!errorRoute)
        return new Response(String(err), { status: 500 });
    try {
        const rendered = await renderModuleToStream({
            pagePath: errorRoute.pagePath,
            layoutPaths: errorRoute.layoutPaths,
            props: { params, data: undefined, url, error: err, status: 500 },
            loadModule: opts.loadModule,
            cwd: opts.cwd ?? process.cwd(),
            i18n: opts.i18n,
        });
        return htmlResponse(rendered, 500, opts, locale);
    }
    catch (renderErr) {
        if (isRedirectSignal(renderErr))
            return redirectResponse(renderErr);
        console.error('[seawomp] error page error:', renderErr);
        return new Response(String(err), { status: 500 });
    }
}
function htmlResponse(rendered, status, opts, locale) {
    return new Response(wrapStream(rendered.body, {
        title: opts.title,
        frameworkHead: opts.frameworkHead,
        pageHead: rendered.head,
        hydrateScript: opts.hydrateScript,
        lang: locale,
    }), { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function getBrowserLocaleRedirect(request, url, i18n, currentLocale) {
    if (!i18n?.detectBrowserLocale || !currentLocale)
        return null;
    if (request.method !== 'GET' && request.method !== 'HEAD')
        return null;
    if (hasLocalePrefix(url.pathname, i18n))
        return null;
    if (!acceptsHtml(request))
        return null;
    const preferred = preferredLocaleFromAcceptLanguage(request.headers.get('accept-language'), i18n);
    if (preferred === currentLocale)
        return null;
    const redirectUrl = new URL(url.href);
    redirectUrl.pathname = localizeUrl(url.pathname, preferred, i18n.defaultLocale);
    return new Response(null, {
        status: 307,
        headers: {
            location: redirectUrl.href,
            vary: 'Accept-Language',
        },
    });
}
function acceptsHtml(request) {
    const accept = request.headers.get('accept');
    if (!accept)
        return true;
    return accept.includes('text/html') || accept.includes('*/*');
}
/** Prefix the streamed body with the doctype/head opener and suffix with the closing tags. */
function wrapStream(inner, opts) {
    const enc = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            controller.enqueue(enc.encode(openShell({
                title: opts.title,
                frameworkHead: opts.frameworkHead,
                pageHead: opts.pageHead,
                hydrateScript: opts.hydrateScript,
                lang: opts.lang,
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

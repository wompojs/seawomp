/* Render a matched route as HTML.
 *
 * Wraps the page component in (outer → inner) layouts via `children`, runs the loader (if any),
 * then delegates to wompo/ssr `renderToStream`. The resulting `ReadableStream` is what the
 * dev/prod handler pipes back to the HTTP response.
 */
import { pathToFileURL } from 'node:url';
let pageRootCounter = 0;
const runtimeByCwd = new Map();
function importFromApp(spec, cwd) {
    const resolved = Bun.resolveSync(spec, cwd);
    return import(pathToFileURL(resolved).href);
}
function getWompoRuntime(cwd) {
    let cached = runtimeByCwd.get(cwd);
    if (!cached) {
        cached = Promise.all([importFromApp('wompo', cwd), importFromApp('wompo/ssr', cwd)]).then(([wompo, ssr]) => ({
            attrs: wompo.attrs,
            defineWompo: wompo.defineWompo,
            html: wompo.html,
            renderToStream: ssr.renderToStream,
        }));
        runtimeByCwd.set(cwd, cached);
    }
    return cached;
}
export async function renderRouteToStream(input) {
    const { route, params, request, loadModule, cwd } = input;
    const runtime = await getWompoRuntime(cwd);
    const url = new URL(request.url);
    // Loader (optional) — awaited fully before we begin rendering so the data is available to
    // the page component.
    let data = undefined;
    if (route.loaderPath) {
        const mod = (await loadModule(route.loaderPath));
        const args = { params, request, url };
        data = await mod.loader(args);
    }
    const pageMod = (await loadModule(route.pagePath));
    const Page = pageMod.default;
    const layoutMods = await Promise.all(route.layoutPaths.map((p) => loadModule(p)));
    const layouts = layoutMods.map((m) => m.default);
    const pageProps = { params, data, url };
    const PageRoot = makePageRoot(runtime, Page, layouts);
    return runtime.renderToStream(PageRoot, pageProps);
}
/** Build a single root component whose render tree is `Layout0 > Layout1 > ... > Page`. The
 * function is wrapped with `defineWompo` so it's a fully-typed Wompo component (component name,
 * `_$wompoF` marker, etc.). A counter suffix keeps the registry entries distinct across routes
 * even though the rendered tree changes per request. */
function makePageRoot({ attrs, defineWompo, html }, Page, layouts) {
    const name = `seawomp-page-root-${++pageRootCounter}`;
    function PageRoot(props) {
        // Spread page props into <Page> via attrs() so the page receives PageProps directly.
        let composed = html `<${Page} ${attrs(props)} />`;
        for (let i = layouts.length - 1; i >= 0; i--) {
            const Layout = layouts[i];
            const inner = composed;
            composed = html `<${Layout}>${inner}</${Layout}>`;
        }
        return composed;
    }
    return defineWompo(PageRoot, { name });
}

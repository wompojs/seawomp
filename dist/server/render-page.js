import { getWompoRuntime } from './wompo-runtime.js';
import { setActiveSsrLocale, setActiveSsrPath } from '../i18n/context.js';
import { getLocale } from '../i18n/index.js';
let pageRootCounter = 0;
let headRootCounter = 0;
export async function renderRouteToStream(input) {
    const { route, params, request, loadModule, cwd, i18n } = input;
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
    const pageProps = { params, data, url };
    return renderLoadedModuleToStream({
        runtime,
        pageMod,
        pagePath: route.pagePath,
        layoutPaths: route.layoutPaths,
        props: pageProps,
        loadModule,
        i18n,
    });
}
export async function renderModuleToStream(input) {
    const runtime = await getWompoRuntime(input.cwd);
    const pageMod = (await input.loadModule(input.pagePath));
    return renderLoadedModuleToStream({ runtime, pageMod, ...input });
}
async function renderLoadedModuleToStream(input) {
    const { runtime, pageMod, layoutPaths, props, loadModule, i18n } = input;
    const Page = pageMod.default;
    const layoutMods = await Promise.all(layoutPaths.map((p) => loadModule(p)));
    const layouts = layoutMods.map((m) => m.default);
    const headFragment = await renderHeadFragment(runtime, [
        ...layoutMods.map((mod, index) => ({
            head: mod.head,
            props,
            source: layoutPaths[index],
        })),
        { head: pageMod.head, props, source: input.pagePath },
    ]);
    const localeValue = computeLocaleValue(i18n, props);
    const releaseLocale = localeValue ? setActiveSsrLocale(localeValue) : null;
    const pathname = props.url?.pathname;
    const releasePath = pathname ? setActiveSsrPath(pathname) : null;
    const PageRoot = makePageRoot(runtime, Page, layouts);
    const rawBody = await runtime.renderToStream(PageRoot, props);
    const cleanup = releaseLocale || releasePath
        ? () => {
            releasePath?.();
            releaseLocale?.();
        }
        : null;
    const body = cleanup ? withCleanup(rawBody, cleanup) : rawBody;
    return { body, head: headFragment };
}
function withCleanup(source, cleanup) {
    const reader = source.getReader();
    let disposed = false;
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        cleanup();
    };
    return new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    dispose();
                    controller.close();
                    return;
                }
                if (value)
                    controller.enqueue(value);
            }
            catch (err) {
                dispose();
                controller.error(err);
            }
        },
        cancel(reason) {
            dispose();
            return reader.cancel(reason);
        },
    });
}
function computeLocaleValue(i18n, props) {
    if (!i18n || !props.url)
        return null;
    return {
        locale: getLocale(props.url, i18n),
        defaultLocale: i18n.defaultLocale,
        locales: i18n.locales,
    };
}
async function renderHeadFragment(runtime, entries) {
    let out = '';
    for (const entry of entries) {
        if (!entry.head)
            continue;
        const result = entry.head(entry.props);
        if (result == null)
            continue;
        if (!isRenderHtml(result)) {
            throw new Error(`[seawomp] head() in ${entry.source} must return html\`\` output from wompo, not ${describeHeadResult(result)}.`);
        }
        out += await renderHeadHtml(runtime, result, entry.source);
    }
    return tagHeadFragment(out);
}
function isRenderHtml(value) {
    return Boolean(value && typeof value === 'object' && value._$wompoHtml === true);
}
function describeHeadResult(value) {
    if (typeof value === 'string')
        return 'a string';
    if (value === false)
        return 'false';
    return Object.prototype.toString.call(value);
}
async function renderHeadHtml(runtime, headHtml, source) {
    const name = `seawomp-head-root-${++headRootCounter}`;
    function HeadRoot() {
        return headHtml;
    }
    const Component = runtime.defineWompo(HeadRoot, { name });
    const rendered = await runtime.ssr.renderToString(Component, {}, { hydration: 'none', css: 'none' });
    let html = String(rendered.html ?? '');
    const open = new RegExp(`^<${name}\\b[^>]*>`, 'i');
    html = html.replace(open, '');
    const close = `</${name}>`;
    if (html.toLowerCase().endsWith(close))
        html = html.slice(0, -close.length);
    if (html.includes(`<${name}`)) {
        throw new Error(`[seawomp] could not unwrap head() output for ${source}.`);
    }
    return html.replace(/<!--\/?w-->/g, '');
}
/** Walk a flat HTML fragment and add `data-seawomp-head` to every top-level element. The page's
 * `head()` is expected to return a list of elements at the same nesting depth (titles, metas,
 * links) — no element-inside-element nesting. We rely on that to keep the parser tiny. */
function tagHeadFragment(fragment) {
    if (!fragment)
        return '';
    let out = '';
    let i = 0;
    const len = fragment.length;
    while (i < len) {
        const lt = fragment.indexOf('<', i);
        if (lt === -1) {
            out += fragment.slice(i);
            break;
        }
        out += fragment.slice(i, lt);
        // Closing tag, comment, doctype, or PI — passthrough.
        if (fragment[lt + 1] === '/' ||
            fragment[lt + 1] === '!' ||
            fragment[lt + 1] === '?') {
            const gt = fragment.indexOf('>', lt + 1);
            if (gt === -1) {
                out += fragment.slice(lt);
                break;
            }
            out += fragment.slice(lt, gt + 1);
            i = gt + 1;
            continue;
        }
        // Opening tag — match the name, then inject the marker attribute.
        const nameMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(fragment.slice(lt));
        if (!nameMatch) {
            out += fragment[lt];
            i = lt + 1;
            continue;
        }
        const name = nameMatch[1];
        const afterName = lt + 1 + name.length;
        const gt = fragment.indexOf('>', afterName);
        if (gt === -1) {
            out += fragment.slice(lt);
            break;
        }
        out += `<${name} data-seawomp-head` + fragment.slice(afterName, gt + 1);
        // If this tag was self-closing (`<meta … />`) or void (meta/link/base), no skip needed.
        // Otherwise jump past the matching closer so we don't tag nested children.
        const isSelfClosing = fragment[gt - 1] === '/' || VOID_TAGS.has(name.toLowerCase());
        if (isSelfClosing) {
            i = gt + 1;
        }
        else {
            const closer = `</${name}`;
            const closeIdx = fragment.toLowerCase().indexOf(closer, gt + 1);
            if (closeIdx === -1) {
                i = gt + 1;
            }
            else {
                const closeEnd = fragment.indexOf('>', closeIdx);
                out += fragment.slice(gt + 1, closeEnd + 1);
                i = closeEnd + 1;
            }
        }
    }
    return out;
}
const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
/** Build a single root component whose render tree is `Layout0 > Layout1 > ... > Page`. The
 * function is wrapped with `defineWompo` so it's a fully-typed Wompo component (component name,
 * `_$wompoF` marker, etc.). A counter suffix keeps the registry entries distinct across routes
 * even though the rendered tree changes per request. */
function makePageRoot({ attrs, defineWompo, html }, Page, layouts) {
    const name = `seawomp-page-root-${++pageRootCounter}`;
    function PageRoot(props) {
        // Spread page props into <Page> via attrs() so the page receives PageProps directly.
        let composed = html `
			<seawomp-route-view data-seawomp-route-view>
				<${Page} ${attrs(props)} />
			</seawomp-route-view>
		`;
        for (let i = layouts.length - 1; i >= 0; i--) {
            const Layout = layouts[i];
            const inner = composed;
            composed = html `<${Layout} ${attrs(props)}>${inner}</${Layout}>`;
        }
        return composed;
    }
    return defineWompo(PageRoot, { name });
}

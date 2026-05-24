/* Render a matched route as HTML.
 *
 * Wraps the page component in (outer → inner) layouts via `children`, runs the loader (if any),
 * then delegates to wompo/ssr `renderToStream`. The resulting `ReadableStream` is what the
 * dev/prod handler pipes back to the HTTP response.
 */
import type { LayoutModule, Loader, LoaderArgs, PageModule, PageProps } from '../types.js';
import type { RouteEntry } from './routes.js';
import { getWompoRuntime, type WompoComponent, type WompoRuntime } from './wompo-runtime.js';

export interface RenderPageInput {
	route: RouteEntry;
	/** Parsed params from the URL match (after applying the route regex). */
	params: Record<string, string>;
	/** The original Fetch-API Request. */
	request: Request;
	/** Module loader injected by the host (Vite dev or built ESM). */
	loadModule: (absPath: string) => Promise<unknown>;
	/** App root used to resolve peer singletons such as wompo. */
	cwd: string;
}

export interface RenderPageOutput {
	body: ReadableStream<Uint8Array>;
	/** HTML fragment to inject into <head>: the result of `pageMod.head(props)` with each
	 * top-level element tagged `data-seawomp-head` so SPA navigation can swap it in place. */
	head: string;
}

let pageRootCounter = 0;

export async function renderRouteToStream(input: RenderPageInput): Promise<RenderPageOutput> {
	const { route, params, request, loadModule, cwd } = input;
	const runtime = await getWompoRuntime(cwd);
	const url = new URL(request.url);

	// Loader (optional) — awaited fully before we begin rendering so the data is available to
	// the page component.
	let data: unknown = undefined;
	if (route.loaderPath) {
		const mod = (await loadModule(route.loaderPath)) as { loader: Loader };
		const args: LoaderArgs = { params, request, url };
		data = await mod.loader(args);
	}

	const pageMod = (await loadModule(route.pagePath)) as PageModule;
	const Page = pageMod.default;
	const layoutMods = await Promise.all(
		route.layoutPaths.map((p) => loadModule(p) as Promise<LayoutModule>),
	);
	const layouts: WompoComponent[] = layoutMods.map((m) => m.default);

	const pageProps: PageProps = { params, data, url };
	const headFragment = pageMod.head ? tagHeadFragment(pageMod.head(pageProps) ?? '') : '';
	const PageRoot = makePageRoot(runtime, Page, layouts);
	const body = await runtime.renderToStream(PageRoot, pageProps as any);
	return { body, head: headFragment };
}

/** Walk a flat HTML fragment and add `data-seawomp-head` to every top-level element. The page's
 * `head()` is expected to return a list of elements at the same nesting depth (titles, metas,
 * links) — no element-inside-element nesting. We rely on that to keep the parser tiny. */
function tagHeadFragment(fragment: string): string {
	if (!fragment) return '';
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
		if (
			fragment[lt + 1] === '/' ||
			fragment[lt + 1] === '!' ||
			fragment[lt + 1] === '?'
		) {
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
		} else {
			const closer = `</${name}`;
			const closeIdx = fragment.toLowerCase().indexOf(closer, gt + 1);
			if (closeIdx === -1) {
				i = gt + 1;
			} else {
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
function makePageRoot(
	{ attrs, defineWompo, html }: WompoRuntime,
	Page: WompoComponent,
	layouts: WompoComponent[],
): WompoComponent {
	const name = `seawomp-page-root-${++pageRootCounter}`;
	function PageRoot(props: any) {
		// Spread page props into <Page> via attrs() so the page receives PageProps directly.
		let composed = html`<${Page} ${attrs(props)} />`;
		for (let i = layouts.length - 1; i >= 0; i--) {
			const Layout = layouts[i];
			const inner = composed;
			composed = html`<${Layout}>${inner}</${Layout}>`;
		}
		return composed;
	}
	return defineWompo(PageRoot as WompoComponent, { name });
}

/* Render a matched route as HTML.
 *
 * Wraps the page component in (outer → inner) layouts via `children`, runs the loader (if any),
 * then delegates to wompo/ssr `renderToStream`. The resulting `ReadableStream` is what the
 * dev/prod handler pipes back to the HTTP response.
 */
import { pathToFileURL } from 'node:url';
import type { LayoutModule, Loader, LoaderArgs, PageModule, PageProps } from '../types.js';
import type { RouteEntry } from './routes.js';

type WompoComponent = (...args: any[]) => any;

interface WompoRuntime {
	attrs: (props: unknown) => unknown;
	defineWompo: (component: WompoComponent, opts: { name: string }) => WompoComponent;
	html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
	renderToStream: (
		component: WompoComponent,
		props?: unknown,
	) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
}

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

let pageRootCounter = 0;
const runtimeByCwd = new Map<string, Promise<WompoRuntime>>();

function importFromApp(spec: string, cwd: string): Promise<any> {
	const resolved = Bun.resolveSync(spec, cwd);
	return import(pathToFileURL(resolved).href);
}

function getWompoRuntime(cwd: string): Promise<WompoRuntime> {
	let cached = runtimeByCwd.get(cwd);
	if (!cached) {
		cached = Promise.all([importFromApp('wompo', cwd), importFromApp('wompo/ssr', cwd)]).then(
			([wompo, ssr]) => ({
				attrs: wompo.attrs,
				defineWompo: wompo.defineWompo,
				html: wompo.html,
				renderToStream: ssr.renderToStream,
			}),
		);
		runtimeByCwd.set(cwd, cached);
	}
	return cached;
}

export async function renderRouteToStream(
	input: RenderPageInput,
): Promise<ReadableStream<Uint8Array>> {
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
	const PageRoot = makePageRoot(runtime, Page, layouts);
	return runtime.renderToStream(PageRoot, pageProps as any);
}

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

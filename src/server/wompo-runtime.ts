import { pathToFileURL } from 'node:url';

export type WompoComponent = (...args: any[]) => any;

export interface WompoRuntime {
	attrs: (props: unknown) => unknown;
	defineWompo: (component: WompoComponent, opts: { name: string }) => WompoComponent;
	html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
	renderToStream: (
		component: WompoComponent,
		props?: unknown,
	) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
	ssr: any;
}

const runtimeByCwd = new Map<string, Promise<WompoRuntime>>();

function importFromApp(spec: string, cwd: string): Promise<any> {
	const resolved = Bun.resolveSync(spec, cwd);
	return import(pathToFileURL(resolved).href);
}

export function getWompoRuntime(cwd: string): Promise<WompoRuntime> {
	let cached = runtimeByCwd.get(cwd);
	if (!cached) {
		cached = Promise.all([importFromApp('wompo', cwd), importFromApp('wompo/ssr', cwd)]).then(
			([wompo, ssr]) => ({
				attrs: wompo.attrs,
				defineWompo: wompo.defineWompo,
				html: wompo.html,
				renderToStream: ssr.renderToStream,
				ssr,
			}),
		);
		runtimeByCwd.set(cwd, cached);
	}
	return cached;
}

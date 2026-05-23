import { Hono } from 'hono';
import { loadConfig, resolveConfig, type SeawompConfig } from '../config.js';
import { createProdHandler, type ProdFetchHandler } from '../build/serve-prod.js';

export interface VercelAdapterOptions {
	cwd?: string;
	config?: SeawompConfig;
}

export async function createVercelHandler(
	opts: VercelAdapterOptions = {},
): Promise<ProdFetchHandler> {
	const cwd = opts.cwd ?? process.cwd();
	const cfg = resolveConfig(cwd, opts.config ?? (await loadConfig(cwd)), 'build');
	return createProdHandler(cfg, cwd);
}

export function createVercelApp(opts: VercelAdapterOptions = {}): Hono {
	const app = new Hono();
	let handlerPromise: Promise<ProdFetchHandler> | undefined;

	const getHandler = () => {
		handlerPromise ??= createVercelHandler(opts);
		return handlerPromise;
	};

	app.all('*', async (c) => {
		const handler = await getHandler();
		return handler(c.req.raw);
	});

	return app;
}

export default createVercelApp;

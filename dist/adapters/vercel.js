import { Hono } from 'hono';
import { loadConfig, resolveConfig } from '../config.js';
import { createProdHandler } from '../build/serve-prod.js';
export async function createVercelHandler(opts = {}) {
    const cwd = opts.cwd ?? process.cwd();
    const cfg = resolveConfig(cwd, opts.config ?? (await loadConfig(cwd)), 'build');
    return createProdHandler(cfg, cwd);
}
export function createVercelApp(opts = {}) {
    const app = new Hono();
    let handlerPromise;
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

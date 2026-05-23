/* seawomp config layer.
 *
 * Apps export their config via `seawomp.config.ts`:
 *
 *   import { defineConfig } from 'seawomp/config';
 *   export default defineConfig({ title: 'My App', globalCss: 'public/global.css' });
 *
 * `loadConfig(cwd)` finds and imports it; missing file → empty config (all defaults).
 */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
/** Identity function — gives editors a type-checked literal config object. */
export function defineConfig(c) {
    return c;
}
const CONFIG_FILES = ['seawomp.config.ts', 'seawomp.config.js', 'seawomp.config.mjs'];
/** Locate the user's config file in `cwd` and import it. Missing file returns `{}`. */
export async function loadConfig(cwd) {
    for (const name of CONFIG_FILES) {
        const abs = path.join(cwd, name);
        if (!fs.existsSync(abs))
            continue;
        const mod = await import(pathToFileURL(abs).href);
        const cfg = mod.default ?? mod;
        if (cfg && typeof cfg === 'object')
            return cfg;
    }
    return {};
}
export function resolveConfig(cwd, cfg, mode) {
    const prod = mode === 'build';
    return {
        appDir: path.resolve(cwd, cfg.appDir ?? 'app'),
        publicDir: path.resolve(cwd, cfg.publicDir ?? 'public'),
        port: cfg.port ?? 5173,
        outDir: path.resolve(cwd, cfg.outDir ?? '.seawomp'),
        title: cfg.title,
        globalCss: cfg.globalCss
            ? path.isAbsolute(cfg.globalCss)
                ? cfg.globalCss
                : path.resolve(cwd, cfg.globalCss)
            : undefined,
        headExtra: cfg.headExtra,
        images: {
            sizes: cfg.images?.sizes ?? [640, 960, 1280, 1920],
            formats: cfg.images?.formats ?? ['avif', 'webp'],
            disabled: cfg.images?.disabled ?? false,
        },
        minify: {
            js: cfg.minify?.js ?? prod,
            css: cfg.minify?.css ?? prod,
            html: cfg.minify?.html ?? prod,
        },
    };
}

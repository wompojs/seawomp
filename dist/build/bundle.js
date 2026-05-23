/* Production build orchestration.
 *
 * Outputs:
 *   <outDir>/server/<*.js>           — server-side bundles of every page/layout/loader/action/api
 *   <outDir>/static/_assets/<*.js>   — client bundles (hashed, minified, code-split)
 *   <outDir>/static/_assets/img/*    — optimized image variants
 *   <outDir>/static/_assets/global-<hash>.css — minified global CSS
 *   <outDir>/static/<route>/index.html — prerendered HTML for prerender:true pages
 *   <outDir>/manifest.json           — route → asset map (BuildManifest)
 *
 * The server bundles run on Bun (`target: 'bun'`). The client bundles are browser ESM, code-split
 * across all entrypoints so shared chunks (wompo, seawomp/client, app utilities) are deduplicated.
 */
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { scanRoutes } from '../server/routes.js';
import { scanApiRoutes } from '../server/api-router.js';
import { manifestFromRoutes, serializeManifest } from '../server/manifest.js';
import { minifyCss } from './minify-css.js';
import { buildImages } from './images.js';
const HYDRATE_ENTRY_BASENAME = '_hydrate-entry.ts';
export async function buildAll(cfg, cwd, opts = {}) {
    const target = opts.target ?? 'bun';
    const t0 = Date.now();
    const staticDir = path.join(cfg.outDir, 'static');
    const assetsDir = path.join(staticDir, '_assets');
    const serverDir = path.join(cfg.outDir, 'server');
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.mkdir(serverDir, { recursive: true });
    const routes = scanRoutes(cfg.appDir);
    const apiRoutes = scanApiRoutes(cfg.appDir);
    console.log(`[seawomp] discovered ${routes.length} page route(s), ${apiRoutes.length} api route(s)`);
    // 1) Image pipeline (runs first so the manifest is embedded in the head extra).
    const { manifest: imageManifest, written: imgCount } = await buildImages({
        publicDir: cfg.publicDir,
        outAssetsDir: assetsDir,
        publicPrefix: '/_assets/img',
        images: cfg.images,
    });
    if (imgCount)
        console.log(`[seawomp] generated ${imgCount} image variant(s)`);
    // 2) Global CSS — minify and content-hash.
    let globalCssAssetUrl;
    if (cfg.globalCss) {
        try {
            const raw = await fs.readFile(cfg.globalCss, 'utf-8');
            const minified = cfg.minify.css ? minifyCss(raw, cfg.globalCss) : raw;
            const hash = Bun.hash(minified).toString(16).slice(0, 8);
            const outName = `global-${hash}.css`;
            await fs.writeFile(path.join(assetsDir, outName), minified, 'utf-8');
            globalCssAssetUrl = `/_assets/${outName}`;
        }
        catch (err) {
            console.warn(`[seawomp] could not process globalCss: ${err.message}`);
        }
    }
    // 3) Write a tiny hydrate entry to a tmp file under <outDir> so Bun.build can ingest it
    //    alongside the route modules.
    const hydrateEntryAbs = path.join(cfg.outDir, HYDRATE_ENTRY_BASENAME);
    const hydrateEntrySource = generateHydrateEntrySource(routes);
    await fs.writeFile(hydrateEntryAbs, hydrateEntrySource, 'utf-8');
    // 4) Client bundle — every page/layout + the hydrate entry. Code-split so shared imports
    //    (wompo, seawomp/client) collapse into common chunks.
    const clientEntries = Array.from(new Set([
        hydrateEntryAbs,
        ...routes.map((r) => r.pagePath),
        ...routes.flatMap((r) => r.layoutPaths),
    ]));
    const clientResult = await Bun.build({
        entrypoints: clientEntries,
        outdir: assetsDir,
        target: 'browser',
        format: 'esm',
        splitting: true,
        minify: cfg.minify.js ? { whitespace: true, identifiers: true, syntax: true } : false,
        sourcemap: 'linked',
        naming: {
            entry: '[name]-[hash].[ext]',
            chunk: '[name]-[hash].[ext]',
            asset: '[name]-[hash].[ext]',
        },
        plugins: [dedupeSingletonsPlugin(cwd)],
    });
    if (!clientResult.success) {
        for (const log of clientResult.logs)
            console.error('[seawomp:client]', log);
        throw new Error('client bundle failed');
    }
    console.log(`[seawomp] client bundle: ${clientResult.outputs.length} file(s)`);
    // Build a map from source abs path → emitted asset URL.
    const clientAssetByEntry = new Map();
    for (const o of clientResult.outputs) {
        if (o.kind !== 'entry-point')
            continue;
        const entryPath = o.sourcemapFile ? undefined : (o.inputPath ?? null);
        // `Bun.build` doesn't expose the entrypoint per output reliably; use path basename to match.
        const stem = path.basename(o.path).split('-')[0];
        if (entryPath)
            clientAssetByEntry.set(entryPath, '/_assets/' + path.basename(o.path));
        else {
            // Fallback: match by stem against entrypoints.
            const guess = clientEntries.find((e) => path.basename(e, path.extname(e)) === stem);
            if (guess && !clientAssetByEntry.has(guess))
                clientAssetByEntry.set(guess, '/_assets/' + path.basename(o.path));
        }
    }
    // 5) Server bundle — each route module compiled for Bun runtime.
    const serverEntries = Array.from(new Set([
        ...routes.map((r) => r.pagePath),
        ...routes.flatMap((r) => r.layoutPaths),
        ...routes.flatMap((r) => (r.loaderPath ? [r.loaderPath] : [])),
        ...routes.flatMap((r) => (r.errorPath ? [r.errorPath] : [])),
        ...apiRoutes.map((r) => r.modulePath),
    ]));
    if (serverEntries.length) {
        const serverResult = await Bun.build({
            entrypoints: serverEntries,
            outdir: serverDir,
            target: 'bun',
            format: 'esm',
            splitting: false,
            minify: false, // server-side: keep readable for stack traces
            sourcemap: 'linked',
            external: ['wompo', 'wompo/*', 'seawomp', 'seawomp/*'],
            root: cwd,
            // Preserve source path structure so app/work/page.ts and app/about/page.ts don't collide
            // on a flat `page.js` name.
            naming: { entry: '[dir]/[name].[ext]', chunk: '[name]-[hash].[ext]', asset: '[name].[ext]' },
        });
        if (!serverResult.success) {
            for (const log of serverResult.logs)
                console.error('[seawomp:server]', log);
            throw new Error('server bundle failed');
        }
        console.log(`[seawomp] server bundle: ${serverResult.outputs.length} file(s)`);
    }
    // 6) Write the manifest.
    const manifest = {
        ...manifestFromRoutes(routes),
        routes: routes.map((r) => ({
            pattern: r.pattern,
            page: r.pagePath,
            layouts: r.layoutPaths,
            loader: r.loaderPath,
            error: r.errorPath,
            serverPage: toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, r.pagePath)),
            serverLayouts: r.layoutPaths.map((p) => toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, p))),
            serverLoader: r.loaderPath
                ? toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, r.loaderPath))
                : undefined,
            serverError: r.errorPath
                ? toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, r.errorPath))
                : undefined,
            css: [],
        })),
        apiRoutes: apiRoutes.map((r) => ({
            pattern: r.pattern,
            modulePath: r.modulePath,
            serverModulePath: toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, r.modulePath)),
        })),
        global: { css: globalCssAssetUrl },
        images: imageManifest,
    };
    await fs.writeFile(path.join(cfg.outDir, 'manifest.json'), serializeManifest(manifest), 'utf-8');
    // 7) Vercel static output includes public/ files because production functions should not
    // depend on serving them from the source tree.
    if (target === 'vercel') {
        const copied = await copyPublicToStatic(cfg.publicDir, staticDir);
        if (copied)
            console.log(`[seawomp] copied ${copied} public file(s) into Vercel static output`);
    }
    // 8) Cleanup temp hydrate entry.
    await fs.unlink(hydrateEntryAbs).catch(() => { });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[seawomp] build${target === 'vercel' ? ' (vercel)' : ''} complete in ${elapsed}s → ${cfg.outDir}`);
}
function mapToServerBundle(cwd, serverDir, abs) {
    const rel = path.relative(cwd, abs);
    const noExt = rel.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '.js');
    return path.join(serverDir, noExt);
}
function toOutDirRelative(outDir, abs) {
    return normalizeOutputPath(path.relative(outDir, abs));
}
function normalizeOutputPath(p) {
    return p.split(path.sep).join('/');
}
async function copyPublicToStatic(publicDir, staticDir) {
    let copied = 0;
    let entries;
    try {
        entries = await fs.readdir(publicDir, { withFileTypes: true });
    }
    catch {
        return 0;
    }
    async function copyDir(srcDir, dstDir) {
        await fs.mkdir(dstDir, { recursive: true });
        const dirEntries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const ent of dirEntries) {
            const src = path.join(srcDir, ent.name);
            const dst = path.join(dstDir, ent.name);
            if (ent.isDirectory()) {
                await copyDir(src, dst);
                continue;
            }
            if (!ent.isFile())
                continue;
            try {
                await fs.copyFile(src, dst, fsConstants.COPYFILE_EXCL);
                copied++;
            }
            catch (err) {
                if (err?.code !== 'EEXIST')
                    throw err;
            }
        }
    }
    if (entries.length)
        await copyDir(publicDir, staticDir);
    return copied;
}
/** Generate the hydrate-entry source for the production build. The route URLs point at the
 * built /_assets/* chunks; the import paths are placeholders we fix up after build (Bun.build
 * gives each entrypoint a hashed output URL we don't know in advance). For v1 we keep this
 * simple: import seawomp/client + register the route table referencing the source paths and
 * let the runtime bootstrap fall back to them. Once the manifest is written, downstream
 * consumers can override at runtime. */
function generateHydrateEntrySource(routes) {
    const records = routes.map((r) => ({
        pattern: r.pattern,
        page: r.pagePath,
        layouts: r.layoutPaths,
    }));
    return `\
import { hydrate, setRoutes } from 'seawomp/client';

const routes = ${JSON.stringify(records)};
setRoutes(routes);

function compile(pattern) {
  const parts = pattern.split('/').map((seg) => {
    if (!seg) return '';
    if (/^:(.+)\\*$/.test(seg)) return '(.*)';
    if (/^:(.+)$/.test(seg)) return '([^/]+)';
    return seg.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  });
  return new RegExp('^' + parts.join('/') + '/?$');
}

async function bootstrap() {
  const p = location.pathname;
  for (const r of routes) {
    if (compile(r.pattern).test(p)) {
      for (const layout of r.layouts) await import(layout);
      await import(r.page);
      break;
    }
  }
  hydrate(document);
}

bootstrap().catch((err) => console.error('[seawomp] hydrate failed:', err));
`;
}
/** Force `wompo` and `seawomp` (and their subpaths) to always resolve from the project root,
 * regardless of which file imports them. Without this, a nested install (e.g. when a
 * `file:` linked package ships its own copy in devDependencies) yields two distinct file
 * paths for the same package, defeating `splitting: true` deduplication and producing
 * duplicated module-level state (custom-element registry, render context) in the browser. */
function dedupeSingletonsPlugin(cwd) {
    const SINGLETON_RE = /^(wompo|seawomp)(\/.*)?$/;
    return {
        name: 'seawomp:dedupe-singletons',
        setup(build) {
            build.onResolve({ filter: SINGLETON_RE }, (args) => {
                try {
                    return { path: Bun.resolveSync(args.path, cwd) };
                }
                catch {
                    return null;
                }
            });
        },
    };
}

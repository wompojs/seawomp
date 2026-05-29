/* Production build orchestration.
 *
 * Outputs:
 *   <outDir>/server/<*.js>           — server-side bundles of every page/layout/loader/action/api
 *   <outDir>/static/_assets/<*.js>   — client bundles (hashed, minified, code-split)
 *   <outDir>/static/_assets/img/*    — optimized image variants
 *   <outDir>/static/<route>/index.html — prerendered HTML for prerender:true pages
 *   <outDir>/manifest.json           — route → asset map (BuildManifest)
 *
 * The server bundles run on Bun (`target: 'bun'`). The client bundles are browser ESM, code-split
 * across all entrypoints so shared chunks (wompo, seawomp/client, app utilities) are deduplicated.
 */
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ResolvedConfig } from '../config.js';
import { scanRoutes, scanSpecialRoutes, type RouteEntry, type SpecialRouteEntry, type SpecialRoutes } from '../server/routes.js';
import { scanApiRoutes } from '../server/api-router.js';
import { manifestFromRoutes, serializeManifest, type BuildManifest, type SpecialRouteManifestEntry } from '../server/manifest.js';
import { buildImages, writeOptimizedWebManifest } from './images.js';
import { createFontBuildContext, localizeGoogleFontsInHtml } from './fonts.js';
import { postProcessHtml } from './html-postprocess.js';
import { prerender } from '../server/ssg.js';
import { writeSitemap } from './sitemap.js';
import { createHandler } from '../server/handler.js';
import { discoverabilityHeadTags, writeDiscoverabilityFiles } from './discoverability.js';

const HYDRATE_ENTRY_BASENAME = '_hydrate-entry.ts';

export interface BuildAllOptions {
	target?: 'bun' | 'vercel';
}

export async function buildAll(
	cfg: ResolvedConfig,
	cwd: string,
	opts: BuildAllOptions = {},
): Promise<void> {
	const target = opts.target ?? 'bun';
	const t0 = Date.now();
	const staticDir = path.join(cfg.outDir, 'static');
	const assetsDir = path.join(staticDir, '_assets');
	const serverDir = path.join(cfg.outDir, 'server');
	await cleanBuildOutput(cfg.outDir);
	await fs.mkdir(assetsDir, { recursive: true });
	await fs.mkdir(serverDir, { recursive: true });

	const routes = scanRoutes(cfg.appDir);
	const specialRoutes = scanSpecialRoutes(cfg.appDir);
	const apiRoutes = scanApiRoutes(cfg.appDir);
	console.log(
		`[seawomp] discovered ${routes.length} page route(s), ${apiRoutes.length} api route(s)`,
	);
	const fontContext = createFontBuildContext(assetsDir);
	const frameworkHead = discoverabilityHeadTags(cfg.discoverability);

	// 1) Image pipeline (runs first so the manifest is embedded in the head extra).
	// Also scans appDir for remote URLs referenced in <seawomp-image src="https://…"> tags.
	const { manifest: imageManifest, written: imgCount } = await buildImages({
		publicDir: cfg.publicDir,
		outAssetsDir: assetsDir,
		publicPrefix: '/_assets/img',
		images: cfg.images,
		cwd,
		appDir: cfg.appDir,
	});
	if (imgCount) console.log(`[seawomp] generated ${imgCount} image variant(s)`);
	if (await writeOptimizedWebManifest(cfg.publicDir, staticDir, imageManifest)) {
		console.log('[seawomp] generated optimized manifest.json');
	}

	// 2) Write a tiny hydrate entry to a tmp file under <outDir> so Bun.build can ingest it
	//    alongside the route modules.
	const clientEntryMap = await writeClientEntryProxies(cfg.outDir, routes);
	const hydrateEntryAbs = path.join(cfg.outDir, HYDRATE_ENTRY_BASENAME);
	const hydrateEntrySource = generateHydrateEntrySource(
		routes,
		cfg.i18n,
		cfg.navigation,
		clientEntryMap,
	);
	await fs.writeFile(hydrateEntryAbs, hydrateEntrySource, 'utf-8');

	// 3) Client bundle — every page/layout + the hydrate entry. Code-split so shared imports
	//    (wompo, seawomp/client) collapse into common chunks.
	const clientEntries = Array.from(
		new Set([
			hydrateEntryAbs,
			...clientEntryMap.values(),
		]),
	);

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
		for (const log of clientResult.logs) console.error('[seawomp:client]', log);
		throw new Error('client bundle failed');
	}
	console.log(`[seawomp] client bundle: ${clientResult.outputs.length} file(s)`);

	const clientAssetByEntry = mapClientEntryOutputs(clientResult.outputs, clientEntries);
	const hydrateRuntime = clientAssetByEntry.get(hydrateEntryAbs) ?? '/_hydrate.js';
	await rewriteHydrateRuntimeImports(
		path.join(staticDir, hydrateRuntime.replace(/^\//, '')),
		clientEntryMap,
		clientAssetByEntry,
	);

	// 4) Server bundle — each route module compiled for Bun runtime.
	const serverEntries = Array.from(
		new Set([
			...routes.map((r) => r.pagePath),
			...routes.flatMap((r) => r.layoutPaths),
			...routes.flatMap((r) => (r.loaderPath ? [r.loaderPath] : [])),
			...routes.flatMap((r) => (r.errorPath ? [r.errorPath] : [])),
			...apiRoutes.map((r) => r.modulePath),
			...specialRoutePaths(specialRoutes),
		]),
	);
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
			for (const log of serverResult.logs) console.error('[seawomp:server]', log);
			throw new Error('server bundle failed');
		}
		console.log(`[seawomp] server bundle: ${serverResult.outputs.length} file(s)`);
	}

	// 5) Write the manifest.
	const manifest: BuildManifest = {
		...manifestFromRoutes(routes),
		routes: routes.map((r) => ({
			pattern: r.pattern,
			page: r.pagePath,
			layouts: r.layoutPaths,
			loader: r.loaderPath,
			error: r.errorPath,
			serverPage: toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, r.pagePath)),
			serverLayouts: r.layoutPaths.map((p) =>
				toOutDirRelative(cfg.outDir, mapToServerBundle(cwd, serverDir, p)),
			),
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
			serverModulePath: toOutDirRelative(
				cfg.outDir,
				mapToServerBundle(cwd, serverDir, r.modulePath),
			),
		})),
		hydrateRuntime,
		images: imageManifest,
		head: { framework: frameworkHead },
		notFoundRoute: specialRoutes.notFoundRoute
			? specialRouteToManifest(cwd, cfg.outDir, serverDir, specialRoutes.notFoundRoute)
			: undefined,
		errorRoute: specialRoutes.errorRoute
			? specialRouteToManifest(cwd, cfg.outDir, serverDir, specialRoutes.errorRoute)
			: undefined,
	};
	await fs.writeFile(path.join(cfg.outDir, 'manifest.json'), serializeManifest(manifest), 'utf-8');

	// 6) Static HTML generation for routes that opt into build-time rendering.
	const ssgRoutes = routes.map((r) => mapRouteToServerRoute(cwd, serverDir, r));
	const ssgSpecialRoutes = mapSpecialRoutesToServer(cwd, serverDir, specialRoutes);
	const ssgFrameworkHead = composeFrameworkHead(manifest, frameworkHead);
	const transformHtml = async (html: string) =>
		postProcessHtml(await localizeGoogleFontsInHtml(html, fontContext), {
			minify: cfg.minify.html,
			optimizeLcp: true,
		});
	const ssg = await prerender({
		routes: ssgRoutes,
		loadModule: importFile,
		outDir: staticDir,
		frameworkHead: ssgFrameworkHead,
		hydrateScript: manifest.hydrateRuntime,
		title: cfg.title,
		cwd,
		redirects: cfg.redirects,
		notFoundRoute: ssgSpecialRoutes.notFoundRoute,
		errorRoute: ssgSpecialRoutes.errorRoute,
		i18n: cfg.i18n,
		transformHtml,
	});
	if (ssg.written.length) console.log(`[seawomp] prerendered ${ssg.written.length} page(s)`);
	for (const skip of ssg.skipped) {
		console.warn(`[seawomp] skipped prerender ${skip.pattern}: ${skip.reason}`);
	}
	await renderStaticNotFound({
		routes: ssgRoutes,
		specialRoutes: ssgSpecialRoutes,
		loadModule: importFile,
		staticDir,
		frameworkHead: ssgFrameworkHead,
		hydrateScript: manifest.hydrateRuntime,
		title: cfg.title,
		cwd,
		transformHtml,
	});
	const sitemap = await writeSitemap(staticDir, cfg.siteUrl, ssg.paths);
	if (sitemap) console.log('[seawomp] generated sitemap.xml');
	const discoverabilityFiles = await writeDiscoverabilityFiles(staticDir, cfg, ssg.paths);
	if (discoverabilityFiles.length) {
		console.log(`[seawomp] generated ${discoverabilityFiles.length} discoverability file(s)`);
	}

	if (fontContext.written) console.log(`[seawomp] localized ${fontContext.written} font asset(s)`);

	// 7) Vercel static output includes public/ files because production functions should not
	// depend on serving them from the source tree.
	if (target === 'vercel') {
		const copied = await copyPublicToStatic(cfg.publicDir, staticDir);
		if (copied) console.log(`[seawomp] copied ${copied} public file(s) into Vercel static output`);
	}

	// 8) Cleanup temp hydrate entry.
	await fs.unlink(hydrateEntryAbs).catch(() => {});
	await removePath(path.join(cfg.outDir, 'client-entries')).catch(() => {});

	const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
	console.log(
		`[seawomp] build${target === 'vercel' ? ' (vercel)' : ''} complete in ${elapsed}s → ${cfg.outDir}`,
	);
}

function mapToServerBundle(cwd: string, serverDir: string, abs: string): string {
	const rel = path.relative(cwd, abs);
	const noExt = rel.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '.js');
	return path.join(serverDir, noExt);
}

function toOutDirRelative(outDir: string, abs: string): string {
	return normalizeOutputPath(path.relative(outDir, abs));
}

function normalizeOutputPath(p: string): string {
	return p.split(path.sep).join('/');
}

async function cleanBuildOutput(outDir: string): Promise<void> {
	await Promise.all(
		['static', 'server', 'client-entries'].map((entry) =>
			removePath(path.join(outDir, entry)),
		),
	);
}

async function removePath(abs: string): Promise<void> {
	let stat;
	try {
		stat = await fs.lstat(abs);
	} catch (err: any) {
		if (err?.code === 'ENOENT') return;
		throw err;
	}
	if (stat.isDirectory() && !stat.isSymbolicLink()) {
		const entries = await fs.readdir(abs);
		await Promise.all(entries.map((entry) => removePath(path.join(abs, entry))));
		await fs.rmdir(abs);
		return;
	}
	await fs.unlink(abs);
}

async function writeClientEntryProxies(
	outDir: string,
	routes: RouteEntry[],
): Promise<Map<string, string>> {
	const proxyDir = path.join(outDir, 'client-entries');
	await fs.rm(proxyDir, { recursive: true, force: true }).catch(() => {});
	await fs.mkdir(proxyDir, { recursive: true });

	const sourcePaths = Array.from(
		new Set([...routes.map((r) => r.pagePath), ...routes.flatMap((r) => r.layoutPaths)]),
	);
	const out = new Map<string, string>();
	for (let i = 0; i < sourcePaths.length; i++) {
		const source = sourcePaths[i];
		const kind = source.endsWith('/layout.ts') || source.endsWith('/layout.tsx') ? 'layout' : 'page';
		const proxyPath = path.join(proxyDir, `route-${i}-${kind}.ts`);
		const importPath = relativeImportSpecifier(path.dirname(proxyPath), source);
		await fs.writeFile(proxyPath, `import ${JSON.stringify(importPath)};\nexport {};\n`, 'utf-8');
		out.set(source, proxyPath);
	}
	return out;
}

function relativeImportSpecifier(fromDir: string, target: string): string {
	let rel = path.relative(fromDir, target).split(path.sep).join('/');
	if (!rel.startsWith('.')) rel = './' + rel;
	return rel;
}

function mapClientEntryOutputs(
	outputs: Array<{ kind: string; path: string }>,
	entrypoints: string[],
): Map<string, string> {
	const byEntry = new Map<string, string>();
	for (const entry of entrypoints) {
		const stem = path.basename(entry, path.extname(entry));
		const output = outputs.find(
			(o) => o.kind === 'entry-point' && path.basename(o.path).startsWith(`${stem}-`),
		);
		if (output) byEntry.set(entry, '/_assets/' + path.basename(output.path));
	}
	return byEntry;
}

async function rewriteHydrateRuntimeImports(
	hydratePath: string,
	sourceToProxy: Map<string, string>,
	proxyToAsset: Map<string, string>,
): Promise<void> {
	let code = await fs.readFile(hydratePath, 'utf-8');
	for (const proxyPath of sourceToProxy.values()) {
		const asset = proxyToAsset.get(proxyPath);
		if (!asset) throw new Error(`missing client asset for ${proxyPath}`);
		code = code.split(JSON.stringify(proxyPath)).join(JSON.stringify(asset));
	}
	await fs.writeFile(hydratePath, code, 'utf-8');
}

function specialRoutePaths(specialRoutes: SpecialRoutes): string[] {
	return [
		...(specialRoutes.notFoundRoute
			? [specialRoutes.notFoundRoute.pagePath, ...specialRoutes.notFoundRoute.layoutPaths]
			: []),
		...(specialRoutes.errorRoute
			? [specialRoutes.errorRoute.pagePath, ...specialRoutes.errorRoute.layoutPaths]
			: []),
	];
}

function specialRouteToManifest(
	cwd: string,
	outDir: string,
	serverDir: string,
	route: SpecialRouteEntry,
): SpecialRouteManifestEntry {
	return {
		page: route.pagePath,
		layouts: route.layoutPaths,
		serverPage: toOutDirRelative(outDir, mapToServerBundle(cwd, serverDir, route.pagePath)),
		serverLayouts: route.layoutPaths.map((p) =>
			toOutDirRelative(outDir, mapToServerBundle(cwd, serverDir, p)),
		),
	};
}

function mapRouteToServerRoute(cwd: string, serverDir: string, route: RouteEntry): RouteEntry {
	return {
		...route,
		pagePath: mapToServerBundle(cwd, serverDir, route.pagePath),
		layoutPaths: route.layoutPaths.map((p) => mapToServerBundle(cwd, serverDir, p)),
		loaderPath: route.loaderPath ? mapToServerBundle(cwd, serverDir, route.loaderPath) : undefined,
		errorPath: route.errorPath ? mapToServerBundle(cwd, serverDir, route.errorPath) : undefined,
	};
}

function mapSpecialRoutesToServer(
	cwd: string,
	serverDir: string,
	specialRoutes: SpecialRoutes,
): SpecialRoutes {
	return {
		notFoundRoute: mapSpecialRouteToServer(cwd, serverDir, specialRoutes.notFoundRoute),
		errorRoute: mapSpecialRouteToServer(cwd, serverDir, specialRoutes.errorRoute),
	};
}

function mapSpecialRouteToServer(
	cwd: string,
	serverDir: string,
	route: SpecialRouteEntry | undefined,
): SpecialRouteEntry | undefined {
	if (!route) return undefined;
	return {
		pagePath: mapToServerBundle(cwd, serverDir, route.pagePath),
		layoutPaths: route.layoutPaths.map((p) => mapToServerBundle(cwd, serverDir, p)),
	};
}

function composeFrameworkHead(manifest: BuildManifest, frameworkHead: string | undefined): string {
	let out = frameworkHead ?? '';
	if (manifest.images && Object.keys(manifest.images).length) {
		out += `<script>window.__SEAWOMP_IMAGES=${JSON.stringify(manifest.images)};</script>`;
	}
	return out;
}

async function importFile(abs: string): Promise<unknown> {
	return import(pathToFileURL(abs).href);
}

async function renderStaticNotFound(opts: {
	routes: RouteEntry[];
	specialRoutes: SpecialRoutes;
	loadModule: (abs: string) => Promise<unknown>;
	staticDir: string;
	frameworkHead?: string;
	hydrateScript: string;
	title?: string;
	cwd: string;
	transformHtml: (html: string) => string | Promise<string>;
}): Promise<void> {
	if (!opts.specialRoutes.notFoundRoute) return;
	const handler = createHandler({
		routes: opts.routes,
		loadModule: opts.loadModule,
		title: opts.title,
		frameworkHead: opts.frameworkHead,
		hydrateScript: opts.hydrateScript,
		cwd: opts.cwd,
		notFoundRoute: opts.specialRoutes.notFoundRoute,
		errorRoute: opts.specialRoutes.errorRoute,
	});
	const res = await handler(new Request('http://localhost/__seawomp_404__'));
	if (res.status !== 404) return;
	const html = await opts.transformHtml(await res.text());
	await fs.writeFile(path.join(opts.staticDir, '404.html'), html, 'utf-8');
}

async function copyPublicToStatic(publicDir: string, staticDir: string): Promise<number> {
	let copied = 0;
	let entries;
	try {
		entries = await fs.readdir(publicDir, { withFileTypes: true });
	} catch {
		return 0;
	}

	async function copyDir(srcDir: string, dstDir: string): Promise<void> {
		await fs.mkdir(dstDir, { recursive: true });
		const dirEntries = await fs.readdir(srcDir, { withFileTypes: true });
		for (const ent of dirEntries) {
			const src = path.join(srcDir, ent.name);
			const dst = path.join(dstDir, ent.name);
			if (ent.isDirectory()) {
				await copyDir(src, dst);
				continue;
			}
			if (!ent.isFile()) continue;
			try {
				await fs.copyFile(src, dst, fsConstants.COPYFILE_EXCL);
				copied++;
			} catch (err: any) {
				if (err?.code !== 'EEXIST') throw err;
			}
		}
	}

	if (entries.length) await copyDir(publicDir, staticDir);
	return copied;
}

/** Generate the hydrate-entry source for the production build. The route URLs point at the
 * built /_assets/* chunks; the import paths are placeholders we fix up after build (Bun.build
 * gives each entrypoint a hashed output URL we don't know in advance). For v1 we keep this
 * simple: import seawomp/client + register the route table referencing the source paths and
 * let the runtime bootstrap fall back to them. Once the manifest is written, downstream
 * consumers can override at runtime. */
function generateHydrateEntrySource(
	routes: ReturnType<typeof scanRoutes>,
	i18n: ResolvedConfig['i18n'],
	navigation: ResolvedConfig['navigation'],
	clientEntryMap: Map<string, string>,
): string {
	const records = routes.map((r) => ({
		pattern: r.pattern,
		page: clientEntryMap.get(r.pagePath) ?? r.pagePath,
		layouts: r.layoutPaths.map((p) => clientEntryMap.get(p) ?? p),
	}));
	const i18nConfig = i18n ? JSON.stringify(i18n) : 'null';
	const routerOptionsValue = {
		...(i18n ? { i18n } : {}),
		...(navigation ? { viewTransitions: navigation.viewTransitions } : {}),
	};
	const routerOptions = Object.keys(routerOptionsValue).length
		? `setRouterOptions(${JSON.stringify(routerOptionsValue)});`
		: '';
	return `\
import { hydrate, setRoutes, setRouterOptions } from 'seawomp/client';

const routes = ${JSON.stringify(records)};
const i18nConfig = ${i18nConfig};
setRoutes(routes);
${routerOptions}

function compile(pattern) {
  const parts = pattern.split('/').map((seg) => {
    if (!seg) return '';
    if (/^:(.+)\\*$/.test(seg)) return '(.*)';
    if (/^:(.+)$/.test(seg)) return '([^/]+)';
    return seg.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  });
  return new RegExp('^' + parts.join('/') + '/?$');
}

function stripLocalePrefix(pathname) {
  if (!i18nConfig) return pathname;
  const first = pathname.split('/').filter(Boolean)[0];
  const locale = first && i18nConfig.locales.includes(first) ? first : i18nConfig.defaultLocale;
  if (locale === i18nConfig.defaultLocale) return pathname;
  const prefix = '/' + locale;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length);
  return pathname;
}

async function bootstrap() {
  const p = stripLocalePrefix(location.pathname);
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
function dedupeSingletonsPlugin(cwd: string): import('bun').BunPlugin {
	const SINGLETON_RE = /^(wompo|seawomp)(\/.*)?$/;
	return {
		name: 'seawomp:dedupe-singletons',
		setup(build) {
			build.onResolve({ filter: SINGLETON_RE }, (args) => {
				try {
					return { path: Bun.resolveSync(args.path, cwd) };
				} catch {
					return null;
				}
			});
		},
	};
}

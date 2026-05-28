/* Bun-based dev server. Replaces the previous Vite middleware setup.
 *
 * Responsibilities, kept aligned with what Vite did before:
 *   - Scan `app/` for routes; rescan on file system events and broadcast `'reload'`.
 *   - Compute framework head injection and refresh on source/public changes.
 *   - Mount a Fetch-API request handler that pipes SSR streams back via `Bun.serve`.
 *   - Serve client-side modules through /_src and node_modules deps through /_dep.
 *   - Serve `/_hydrate.js` (the route-aware bootstrap) as a generated string.
 *   - Serve files from `publicDir`.
 *   - Provide a WebSocket on `/__seawomp_hmr` so the client reloads on source changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedConfig } from '../config.js';
import { scanRoutes, scanSpecialRoutes, type RouteEntry, type SpecialRoutes } from '../server/routes.js';
import { scanApiRoutes, type ApiRouteEntry } from '../server/api-router.js';
import { createHandler } from '../server/handler.js';
import { serveStatic } from '../server/static.js';
import { compileRedirects, matchRedirect } from '../server/redirects.js';
import { buildHydrateEntry } from './virtual.js';
import { serveSrc, serveDep, invalidateSrc, invalidateDeps } from './source-server.js';
import { broadcastReload, registerSocket, unregisterSocket } from './hmr.js';
import { discoverabilityHeadTags } from '../build/discoverability.js';

const HYDRATE_PUBLIC = '/_hydrate.js';
const SRC_PREFIX = '/_src/';
const DEP_PREFIX = '/_dep/';
const HMR_PATH = '/__seawomp_hmr';

export async function startDev(cfg: ResolvedConfig, cwd: string): Promise<void> {
	let routes: RouteEntry[] = scanRoutes(cfg.appDir);
	let apiRoutes: ApiRouteEntry[] = scanApiRoutes(cfg.appDir);
	let specialRoutes: SpecialRoutes = scanSpecialRoutes(cfg.appDir);
	const redirects = compileRedirects(cfg.redirects);

	const frameworkHead = discoverabilityHeadTags(cfg.discoverability);

	// File watcher: rescan on any change under appDir; full reload on any source change.
	// `fs.watch` with `recursive: true` works on macOS and Linux as of Node 20.
	if (fs.existsSync(cfg.appDir)) {
		fs.watch(cfg.appDir, { recursive: true }, (_event, filename) => {
			routes = scanRoutes(cfg.appDir);
			apiRoutes = scanApiRoutes(cfg.appDir);
			specialRoutes = scanSpecialRoutes(cfg.appDir);
			if (filename) invalidateSrc(path.join(cfg.appDir, filename));
			broadcastReload();
		});
	}
	// Watch the source tree of the user's project too (e.g. `src/` shared utilities).
	const srcSiblingDir = path.join(cwd, 'src');
	if (fs.existsSync(srcSiblingDir)) {
		fs.watch(srcSiblingDir, { recursive: true }, (_event, filename) => {
			if (filename) invalidateSrc(path.join(srcSiblingDir, filename));
			broadcastReload();
		});
	}
	if (fs.existsSync(cfg.publicDir)) {
		fs.watch(cfg.publicDir, { recursive: true }, (_event, filename) => {
			if (filename) invalidateSrc(path.join(cfg.publicDir, filename));
			broadcastReload();
		});
	}
	watchProjectResources(cwd, cfg);
	watchLinkedDependency(cwd, 'seawomp');
	watchLinkedDependency(cwd, 'wompo');

	// Build a fresh handler each request — `routes` may have changed.
	const buildHandler = async () => {
		return createHandler({
			routes,
			apiRoutes,
			loadModule: (abs) => import(abs),
			title: cfg.title,
			frameworkHead,
			cwd,
			i18n: cfg.i18n,
			redirects: cfg.redirects,
			notFoundRoute: specialRoutes.notFoundRoute,
			errorRoute: specialRoutes.errorRoute,
		});
	};

	const server = Bun.serve({
		port: cfg.port,
		development: true,

		async fetch(req, server) {
			const url = new URL(req.url);
			const pathname = url.pathname;

			// 1. HMR WebSocket upgrade
			if (pathname === HMR_PATH) {
				if (server.upgrade(req)) return undefined as any;
				return new Response('Expected WebSocket', { status: 400 });
			}

			// 2. Hydrate entry — generated JS string baked from the current route table.
			if (pathname === HYDRATE_PUBLIC) {
				const body = buildHydrateEntry(routes, { i18n: cfg.i18n, navigation: cfg.navigation });
				return new Response(body, {
					headers: { 'content-type': 'application/javascript', 'cache-control': 'no-cache' },
				});
			}

			// 3. Source files (TS/JS transpiled + import-rewritten).
			if (pathname.startsWith(SRC_PREFIX)) {
				const abs = pathname.slice(SRC_PREFIX.length - 1); // keep leading slash
				const served = await serveSrc(abs, cwd);
				if (!served) return new Response('Not Found', { status: 404 });
				return new Response(served.code, {
					headers: { 'content-type': served.type, 'cache-control': 'no-cache' },
				});
			}

			// 4. node_modules deps (bundled).
			if (pathname.startsWith(DEP_PREFIX)) {
				const spec = pathname.slice(DEP_PREFIX.length);
				const served = await serveDep(spec, cwd);
				if (!served) return new Response('Not Found', { status: 404 });
				return new Response(served.code, {
					headers: { 'content-type': served.type, 'cache-control': 'no-cache' },
				});
			}

			const redirect = matchRedirect(pathname, url.search, redirects);
			if (redirect) return redirect;

			// 5. Static assets from publicDir (only paths with an extension — otherwise fall through
			//    to the SSR handler so app routes still match).
			if (/\.[a-z0-9]+$/i.test(pathname)) {
				const r = await serveStatic(cfg.publicDir, pathname, { request: req, mode: 'dev' });
				if (r) return r;
			}

			// 6. SSR / API routes.
			try {
				const dispatch = await buildHandler();
				return await dispatch(req);
			} catch (err) {
				console.error('[seawomp] handler error:', err);
				return new Response(String(err), { status: 500 });
			}
		},

		websocket: {
			open(ws) {
				registerSocket(ws);
			},
			close(ws) {
				unregisterSocket(ws);
			},
			message() {
				/* no client-to-server messages used */
			},
		},
	});

	console.log(`\n  seawomp dev → http://localhost:${server.port}\n`);

	function watchProjectResources(projectRoot: string, cfg: ResolvedConfig): void {
		const ignoredRoots = [
			cfg.appDir,
			path.join(projectRoot, 'src'),
			cfg.publicDir,
			cfg.outDir,
			path.join(projectRoot, 'node_modules'),
			path.join(projectRoot, '.git'),
			path.join(projectRoot, 'dist'),
		];
		try {
			fs.watch(projectRoot, { recursive: true }, (_event, filename) => {
				if (!filename) return;
				const abs = path.resolve(projectRoot, filename.toString());
				if (ignoredRoots.some((root) => isInside(abs, root))) return;
				broadcastReload();
			});
		} catch {
			/* project root may not be recursively watchable */
		}
	}

	function isInside(child: string, parent: string): boolean {
		const rel = path.relative(parent, child);
		return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
	}

	function watchLinkedDependency(projectRoot: string, spec: string): void {
		let pkgJson: string;
		try {
			pkgJson = Bun.resolveSync(`${spec}/package.json`, projectRoot);
		} catch {
			return;
		}
		const pkgRoot = path.dirname(pkgJson);
		const distDir = path.join(pkgRoot, 'dist');
		const watchDir = fs.existsSync(distDir) ? distDir : pkgRoot;
		try {
			fs.watch(watchDir, { recursive: true }, () => {
				invalidateDeps();
				broadcastReload();
			});
		} catch {
			/* dependency may be virtual or not watchable */
		}
	}
}

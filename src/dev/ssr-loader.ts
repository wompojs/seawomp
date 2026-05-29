/* Dev-only SSR module loader with hot invalidation.
 *
 * Problem this solves
 * -------------------
 * The dev server renders pages by importing route modules via dynamic `import()`. Native ESM
 * caches every module for the life of the process, so once a page — and the components it pulls
 * in — has been imported, editing a component no longer changes the *server-rendered* HTML. The
 * browser reloads on save (the file watcher broadcasts `'reload'`), but SSR replays the frozen
 * markup and hydration then adopts that stale server DOM. Only the client `/_src/` cache is
 * mtime-fresh, so edits to a component's static text / CSS were invisible and dynamic edits could
 * trigger hydration mismatches. The result is the "components don't reload" behaviour.
 *
 * Fix
 * ---
 * In dev, load each route module through a fresh, per-edit bundle. `Bun.build` inlines the
 * module's *relative* (user app + component) import graph while every bare specifier — `wompo`,
 * `seawomp`, npm deps, `node:*` — is marked external so it resolves to the one singleton instance
 * the render runtime already holds. That keeps the custom-element registry, render context and
 * i18n context coherent. tsconfig path-aliases that point at local files are detected via
 * `Bun.resolveSync` and inlined too, so they stay hot.
 *
 * A global `epoch` counter, bumped by the file watcher on any source change, keys the bundle
 * cache: after an edit the next request rebuilds the modules it needs; within an epoch each module
 * is bundled at most once. Bundles are written under `node_modules/.seawomp/ssr`, imported via a
 * `file://` URL, then unlinked.
 *
 * Re-importing is safe: on the server `defineWompo` never touches `customElements` (the
 * `IS_SERVER` guard in wompo's public API), so re-running a module's registrations cannot throw.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let epoch = 0;

/** Invalidate every cached SSR bundle. Called by the dev file watcher on source changes. */
export function bumpSsrEpoch(): void {
	epoch++;
}

interface CacheEntry {
	epoch: number;
	mod: Promise<unknown>;
}

/** Build a `loadModule` that re-bundles route modules per edit so SSR stays in sync with source. */
export function createDevLoadModule(cwd: string): (absPath: string) => Promise<unknown> {
	const realCwd = safeRealpath(cwd);
	const cacheDir = path.join(realCwd, 'node_modules', '.seawomp', 'ssr');
	prepareCacheDir(cacheDir);
	const cache = new Map<string, CacheEntry>();

	return function loadModule(absPath: string): Promise<unknown> {
		const cached = cache.get(absPath);
		if (cached && cached.epoch === epoch) return cached.mod;
		const entryEpoch = epoch;
		const mod = bundleAndImport(absPath, cacheDir, entryEpoch).catch((err) => {
			// Drop the failed entry so the next request retries instead of serving a cached rejection.
			if (cache.get(absPath)?.mod === mod) cache.delete(absPath);
			throw err;
		});
		cache.set(absPath, { epoch: entryEpoch, mod });
		return mod;
	};
}

async function bundleAndImport(
	absPath: string,
	cacheDir: string,
	entryEpoch: number,
): Promise<unknown> {
	const result = await Bun.build({
		entrypoints: [absPath],
		target: 'bun',
		format: 'esm',
		splitting: false,
		sourcemap: 'inline',
		plugins: [makeExternalizePlugin(absPath)],
	});
	if (!result.success || result.outputs.length === 0) {
		const detail = result.logs.map((l) => String(l)).join('\n');
		throw new Error(`[seawomp] dev SSR bundle failed for ${absPath}\n${detail}`);
	}
	const code = await result.outputs[0].text();
	const safeBase = path.basename(absPath).replace(/[^\w.-]/g, '_');
	const file = path.join(cacheDir, `${safeBase}.${entryEpoch}.${randomToken()}.mjs`);
	await fsp.writeFile(file, code);
	try {
		return await import(pathToFileURL(file).href);
	} finally {
		// The module is fully evaluated once `import()` resolves, so the file is no longer needed.
		fsp.unlink(file).catch(() => {});
	}
}

/** Externalize npm/framework singletons; inline the user's local module graph (incl. aliases). */
function makeExternalizePlugin(entry: string): import('bun').BunPlugin {
	return {
		name: 'seawomp:externalize-bare',
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) => {
				const spec = args.path;
				// Relative / absolute imports are user code → inline so edits are picked up.
				if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('\\')) {
					return undefined;
				}
				// Runtime built-ins are always external.
				if (spec.startsWith('node:') || spec.startsWith('bun:')) {
					return { path: spec, external: true };
				}
				// Decide by resolution: a spec that lands in node_modules is a singleton dep and must
				// stay external; a tsconfig path-alias that lands on a local file is inlined so it
				// stays hot like the rest of the app graph.
				try {
					const fromDir = path.dirname(args.importer || entry);
					const resolved = Bun.resolveSync(spec, fromDir);
					if (resolved.includes(`${path.sep}node_modules${path.sep}`)) {
						return { path: spec, external: true };
					}
					return { path: resolved };
				} catch {
					// Unresolvable here → leave external and let the runtime resolver handle it.
					return { path: spec, external: true };
				}
			});
		},
	};
}

function prepareCacheDir(dir: string): void {
	try {
		fs.mkdirSync(dir, { recursive: true });
		// Clear leftovers from a previous (possibly crashed) run.
		for (const name of fs.readdirSync(dir)) {
			fs.rmSync(path.join(dir, name), { force: true });
		}
	} catch {
		/* best effort */
	}
}

function randomToken(): string {
	return Math.random().toString(36).slice(2, 10);
}

function safeRealpath(p: string): string {
	try {
		return fs.realpathSync(p);
	} catch {
		return p;
	}
}

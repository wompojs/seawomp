/* Dev-time TS / JS module server.
 *
 * Two URL spaces:
 *
 *   /_src/<absolute-path>     — transpile a source file (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`) and
 *                                rewrite its imports so the browser can resolve them. Bare
 *                                specifiers go to /_dep/<spec>; relative paths are resolved
 *                                against the file's dir and emitted as /_src/<abs> URLs.
 *
 *   /_dep/<spec>              — bundle a node_modules package via Bun.build (no externals) and
 *                                serve the resulting ESM. Cached in memory.
 *
 * Singletons: because each source file maps to a unique /_src URL, browser ESM cache guarantees
 * one instance per file. Custom-element registrations and module-level state stay coherent.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

interface CacheEntry {
	code: string;
	mtimeMs: number;
}
const srcCache = new Map<string, CacheEntry>();
const depCache = new Map<string, string>();

// Track every src file we've ever bundled so we can invalidate on file changes.
const srcKnownPaths = new Set<string>();

export function invalidateSrc(abs?: string): void {
	if (abs) srcCache.delete(abs);
	else srcCache.clear();
}

export function invalidateDeps(): void {
	depCache.clear();
}

/** Try several extensions for an import like `./foo` that omitted one. */
async function resolveRelative(fromDir: string, spec: string): Promise<string | null> {
	// Spec ends with .js (TypeScript convention) → look for the .ts/.tsx counterpart on disk.
	const candidate = path.resolve(fromDir, spec);
	const tries = [
		candidate,
		candidate.replace(/\.js$/, '.ts'),
		candidate.replace(/\.js$/, '.tsx'),
		candidate.replace(/\.mjs$/, '.mts'),
		candidate.replace(/\.cjs$/, '.cts'),
		candidate + '.ts',
		candidate + '.tsx',
		candidate + '.js',
		path.join(candidate, 'index.ts'),
		path.join(candidate, 'index.tsx'),
		path.join(candidate, 'index.js'),
	];
	for (const t of tries) {
		try {
			const s = await fs.stat(t);
			if (s.isFile()) return t;
		} catch {
			/* keep trying */
		}
	}
	return null;
}

const IMPORT_RE =
	/((?:^|[^.\w$])(?:import\s*(?:[\w*${}\s,]+\s+from\s+)?|export\s+(?:[\w*${}\s,]+\s+from\s+)?|import\s*))(['"])([^'"\n]+)\2/g;
const DYNAMIC_IMPORT_RE = /(\bimport\s*\(\s*)(['"])([^'"\n]+)\2(\s*\))/g;

async function rewriteImports(jsCode: string, fromFileAbs: string, cwd: string): Promise<string> {
	const fromDir = path.dirname(fromFileAbs);

	async function rewrite(spec: string): Promise<string> {
		// Relative path
		if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
			const resolved = await resolveRelative(fromDir, spec);
			if (resolved) {
				srcKnownPaths.add(resolved);
				return '/_src' + resolved;
			}
			return spec;
		}
		// Bare specifier → /_dep/<spec>
		return '/_dep/' + spec;
	}

	// Collect all matches with replacement promises.
	const matches: { full: string; before: string; quote: string; spec: string; index: number }[] =
		[];
	let m: RegExpExecArray | null;
	IMPORT_RE.lastIndex = 0;
	while ((m = IMPORT_RE.exec(jsCode))) {
		matches.push({ full: m[0], before: m[1], quote: m[2], spec: m[3], index: m.index });
	}
	DYNAMIC_IMPORT_RE.lastIndex = 0;
	while ((m = DYNAMIC_IMPORT_RE.exec(jsCode))) {
		matches.push({ full: m[0], before: m[1], quote: m[2], spec: m[3], index: m.index });
	}

	// Sort descending by index so replacements don't shift earlier ones.
	matches.sort((a, b) => b.index - a.index);

	let out = jsCode;
	for (const match of matches) {
		const rewritten = await rewrite(match.spec);
		const replacement = match.full.replace(
			match.quote + match.spec + match.quote,
			match.quote + rewritten + match.quote,
		);
		out = out.slice(0, match.index) + replacement + out.slice(match.index + match.full.length);
	}
	return out;
}

/** Serve /_src/<abs>: read, transpile, rewrite imports, cache. */
export async function serveSrc(
	absPath: string,
	cwd: string,
): Promise<{ code: string; type: string } | null> {
	let st;
	try {
		st = await fs.stat(absPath);
	} catch {
		return null;
	}
	if (!st.isFile()) return null;

	const cached = srcCache.get(absPath);
	if (cached && cached.mtimeMs === st.mtimeMs)
		return { code: cached.code, type: 'application/javascript' };

	const ext = path.extname(absPath).toLowerCase();
	const raw = await fs.readFile(absPath, 'utf-8');
	let js: string;

	if (TS_EXTS.has(ext) || ext === '.tsx') {
		const loader = ext === '.tsx' ? 'tsx' : 'ts';
		const transpiler = new Bun.Transpiler({ loader: loader as any, target: 'browser' });
		js = await transpiler.transform(raw, loader as any);
	} else if (JS_EXTS.has(ext)) {
		js = raw;
	} else {
		return null;
	}

	const rewritten = await rewriteImports(js, absPath, cwd);
	srcCache.set(absPath, { code: rewritten, mtimeMs: st.mtimeMs });
	srcKnownPaths.add(absPath);
	return { code: rewritten, type: 'application/javascript' };
}

// Packages whose module-level state (custom-element registry, render context) MUST be a singleton
// across every bundle the browser loads. When the user (or a sub-dep) imports one of these,
// we route every reference through `/_dep/<pkg>/<file>` URLs so the browser cache yields one
// module instance per chunk.
const SINGLETON_RE = /^(wompo|seawomp)(\/.*)?$/;
const pkgOf = (s: string): string =>
	s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/', 1)[0];

// Packages that ship as a pre-bundled, browser-ready ESM artifact under `dist/`. For these we
// serve the dist files raw (with relative imports rewritten to absolute `/_dep/<pkg>/<rel>`
// URLs) instead of re-bundling per subpath. Re-bundling each subpath would inline shared
// internals (like `render-context.ts`) into each output, producing two module instances in
// the browser — exactly the duplication the SINGLETON guard yells about.
const STATIC_SINGLETON_PKGS = new Set(['wompo']);

/** Serve /_dep/<spec>: bundle a node_modules entry. Cached forever (restart dev to refresh). */
export async function serveDep(
	spec: string,
	cwd: string,
): Promise<{ code: string; type: string } | null> {
	const cached = depCache.get(spec);
	if (cached) return { code: cached, type: 'application/javascript' };

	// For singletons that ship pre-bundled ESM, serve files raw so chunks dedupe via browser
	// cache. See STATIC_SINGLETON_PKGS comment above.
	if (STATIC_SINGLETON_PKGS.has(pkgOf(spec))) {
		const served = await serveStaticSingleton(spec, cwd);
		if (served) depCache.set(spec, served.code);
		return served;
	}

	// Resolve via Bun.resolveSync so we land on the package's actual entry under node_modules.
	let entry: string;
	try {
		entry = Bun.resolveSync(spec, cwd);
	} catch (err) {
		console.warn(`[seawomp] /_dep/${spec}: resolve failed:`, err);
		return null;
	}

	const currentPkg = pkgOf(spec);

	const result = await Bun.build({
		entrypoints: [entry],
		target: 'browser',
		format: 'esm',
		splitting: false,
		minify: false,
		sourcemap: 'inline',
		plugins: [
			{
				name: 'seawomp:externalize-singletons',
				setup(build) {
					build.onResolve({ filter: SINGLETON_RE }, (args) => {
						// If we're currently bundling THIS singleton package, don't externalize its
						// own internal references (would be circular). Otherwise, leave the bare
						// specifier in the output for the post-process step below to rewrite to
						// `/_dep/<spec>` — Bun.build preserves the original specifier for external
						// imports and ignores any `path` we'd return here.
						if (pkgOf(args.path) === currentPkg) return null;
						return { path: args.path, external: true };
					});
				},
			},
		],
	});
	if (!result.success || result.outputs.length === 0) {
		console.warn(`[seawomp] /_dep/${spec}: build failed`, result.logs);
		return null;
	}
	let code = await result.outputs[0].text();
	// Rewrite externalized singleton imports (`from "wompo/hydrate"` → `from "/_dep/wompo/hydrate"`)
	// so the browser fetches them through the dep server and gets a single module instance.
	code = rewriteSingletonImports(code, currentPkg);
	depCache.set(spec, code);
	return { code, type: 'application/javascript' };
}

function rewriteSingletonImports(code: string, currentPkg: string): string {
	const re = /((?:from|import)\s*\(?\s*)(['"])(wompo|seawomp)((?:\/[^'"]*)?)\2/g;
	return code.replace(re, (full, lead: string, quote: string, pkg: string, sub: string) => {
		if (pkg === currentPkg) return full;
		return `${lead}${quote}/_dep/${pkg}${sub}${quote}`;
	});
}

/** Serve a file from a pre-bundled ESM package raw, rewriting relative imports to absolute
 * `/_dep/<pkg>/<rel-to-pkg-root>` URLs and bare singleton imports to `/_dep/<spec>`. This
 * preserves the package's internal chunk graph: shared chunks become shared URLs, the browser
 * cache dedupes them, and module-level state stays a true singleton. */
async function serveStaticSingleton(
	spec: string,
	cwd: string,
): Promise<{ code: string; type: string } | null> {
	const pkg = pkgOf(spec);

	let pkgJsonPath: string;
	try {
		pkgJsonPath = Bun.resolveSync(`${pkg}/package.json`, cwd);
	} catch (err) {
		console.warn(`[seawomp] /_dep/${spec}: resolve package.json failed:`, err);
		return null;
	}
	const pkgRoot = path.dirname(pkgJsonPath);

	// Resolve the file: first via `exports` (handles `wompo` / `wompo/hydrate`); if that fails,
	// treat the subpath as a direct file path under the package root (handles requests that
	// come from rewritten relative imports, e.g. `/_dep/wompo/dist/chunk-XYZ.js`).
	let absPath: string | null = null;
	try {
		absPath = Bun.resolveSync(spec, cwd);
	} catch {
		if (spec !== pkg) {
			const rel = spec.slice(pkg.length + 1);
			const candidate = path.resolve(pkgRoot, rel);
			try {
				const st = await fs.stat(candidate);
				if (st.isFile()) absPath = candidate;
			} catch {
				/* not found */
			}
		}
	}
	if (!absPath) return null;

	// Safety: file must live inside the package root.
	if (!absPath.startsWith(pkgRoot + path.sep)) return null;

	let raw: string;
	try {
		raw = await fs.readFile(absPath, 'utf-8');
	} catch {
		return null;
	}

	const fromDir = path.dirname(absPath);
	// Bundle output is often minified with no whitespace around `from`, so match the keyword
	// directly with a `\b` boundary instead of requiring trailing whitespace.
	const rewritten = raw.replace(
		/(?<=^|[^.\w$])(from|import)\s*(\(\s*)?(['"])([^'"\n]+)\3/g,
		(full, kw: string, paren: string | undefined, quote: string, importPath: string) => {
			const head = paren ? `${kw}${paren}` : `${kw} `;
			if (importPath.startsWith('./') || importPath.startsWith('../')) {
				const target = path.resolve(fromDir, importPath);
				const rel = path.relative(pkgRoot, target);
				return `${head}${quote}/_dep/${pkg}/${rel}${quote}`;
			}
			if (SINGLETON_RE.test(importPath)) {
				return `${head}${quote}/_dep/${importPath}${quote}`;
			}
			return full;
		},
	);

	return { code: rewritten, type: 'application/javascript' };
}

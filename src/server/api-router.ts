/* API routes — Next.js-style `app/api/**\/route.ts` convention.
 *
 * Each `route.ts` exports zero or more handlers keyed by HTTP verb. The router scans on
 * boot (and on watcher events in dev), compiles each pattern with the same path machinery
 * used by page routes, and dispatches before the page fallback in `createHandler`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { filePathToRoutePattern, compileRoutePattern, normalizeSlashes } from '../shared/paths.js';
import type { ApiRouteModule } from '../types.js';

export interface ApiRouteEntry {
	/** URL pattern, e.g. `/api/users/:id`. */
	pattern: string;
	/** Absolute path of the `route.ts` module. */
	modulePath: string;
}

interface CompiledApi extends ApiRouteEntry {
	regex: RegExp;
	paramNames: string[];
}

const ROUTE_RE = /^route\.(ts|tsx|js|jsx)$/;
const SUPPORTED_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

/** Walk `appDir` and collect every `route.ts` file. The pattern is derived from the file path
 * exactly like page routes — `app/api/users/[id]/route.ts` → `/api/users/:id`. */
export function scanApiRoutes(appDir: string): ApiRouteEntry[] {
	if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) return [];
	const out: ApiRouteEntry[] = [];
	const stack: { dir: string; rel: string }[] = [{ dir: appDir, rel: '' }];

	while (stack.length) {
		const frame = stack.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(frame.dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const ent of entries) {
			const abs = path.join(frame.dir, ent.name);
			if (ent.isDirectory()) {
				stack.push({ dir: abs, rel: frame.rel ? `${frame.rel}/${ent.name}` : ent.name });
			} else if (ROUTE_RE.test(ent.name)) {
				// `filePathToRoutePattern` strips `/page` — not `/route`. Treat the directory itself
				// (without the route filename) as a pseudo-page so the same machinery yields the right
				// pattern. `app/api/health/route.ts` → rel = `api/health` → pattern `/api/health`.
				const dirRel = frame.rel ? `${frame.rel}/page` : 'page';
				out.push({
					pattern: filePathToRoutePattern(dirRel),
					modulePath: normalizeSlashes(abs),
				});
			}
		}
	}

	// Static-segment routes win over dynamic ones, same scoring as page routes.
	out.sort((a, b) => routeScore(b.pattern) - routeScore(a.pattern));
	return out;
}

function routeScore(pattern: string): number {
	let score = 0;
	for (const seg of pattern.split('/').filter(Boolean)) {
		if (seg.endsWith('*')) score += 1;
		else if (seg.startsWith(':')) score += 10;
		else score += 100;
	}
	return score;
}

export function compileApiRoutes(routes: ApiRouteEntry[]): CompiledApi[] {
	return routes.map((r) => ({ ...r, ...compileRoutePattern(r.pattern) }));
}

/** Try to dispatch a request against the API table. Returns null when no pattern matches —
 * caller then falls through to page routing. A matched pattern with an unsupported verb
 * returns 405 (NOT null). */
export async function dispatchApi(
	request: Request,
	compiled: CompiledApi[],
	loadModule: (abs: string) => Promise<unknown>,
): Promise<Response | null> {
	const url = new URL(request.url);
	for (const r of compiled) {
		const m = url.pathname.match(r.regex);
		if (!m) continue;

		const params: Record<string, string> = {};
		r.paramNames.forEach((name, i) => {
			params[name] = decodeURIComponent(m[i + 1] || '');
		});

		const mod = (await loadModule(r.modulePath)) as ApiRouteModule;
		const verb = request.method.toUpperCase() as (typeof SUPPORTED_VERBS)[number];
		const handler = mod[verb];

		if (!handler) {
			const allow = SUPPORTED_VERBS.filter((v) => typeof mod[v] === 'function').join(', ');
			return new Response('Method Not Allowed', {
				status: 405,
				headers: allow ? { allow } : {},
			});
		}
		try {
			return await handler({ request, params, url });
		} catch (err) {
			console.error(`[seawomp] api ${r.pattern} ${verb}:`, err);
			return new Response('Internal Server Error', { status: 500 });
		}
	}
	return null;
}

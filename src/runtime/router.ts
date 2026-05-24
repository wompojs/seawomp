/* Client-side router with View Transitions.
 *
 * `navigate(href)` fetches the destination as HTML, dynamically loads the page + layout modules
 * for the target route (so its components are registered before we re-run hydrate), then swaps
 * the body — wrapped in `document.startViewTransition` when available.
 *
 * `prefetchRoute(href)` warms the HTML + the route modules without committing a navigation.
 * Successfully-fetched HTML is cached so a subsequent `navigate(href)` to the same URL skips
 * the network round-trip entirely. Cache entries expire after `prefetchTtlMs` (configurable
 * via `setRouterOptions`, default 60 000 ms).
 *
 * `emitModulePreloads(href)` injects `<link rel="modulepreload">` for every JS module the
 * target route needs — this primes the browser's module cache so even the first navigation
 * after a hover-prefetch hits warm.
 *
 * Route data is registered once by the hydrate-entry bootstrap via `setRoutes()`; the router
 * doesn't need to import any virtual module itself, which keeps it standalone for testing.
 */
import { hydrate } from 'wompo/hydrate';
import { applyHead } from './head.js';

export interface RouteRecord {
	pattern: string;
	page: string;
	layouts: string[];
}

export interface RouterOptions {
	/** How long a successfully-prefetched HTML body stays warm. Default: 60 000 ms. */
	prefetchTtlMs?: number;
}

let routes: RouteRecord[] = [];
let compiled: { regex: RegExp; rec: RouteRecord }[] = [];

interface PrefetchEntry {
	html: Promise<string>;
	expiresAt: number;
}
const prefetchCache = new Map<string, PrefetchEntry>();
const preloadedModules = new Set<string>();

let prefetchTtlMs = 60_000;

/** Register the dev/build route table. Called once from the hydrate-entry bootstrap. */
export function setRoutes(rs: RouteRecord[]): void {
	routes = rs;
	compiled = rs.map((rec) => ({ regex: compilePattern(rec.pattern), rec }));
}

/** Tunable router knobs — call before any prefetches if you want to override defaults. */
export function setRouterOptions(opts: RouterOptions): void {
	if (typeof opts.prefetchTtlMs === 'number') prefetchTtlMs = opts.prefetchTtlMs;
}

/** Drop the prefetch HTML cache. Mostly useful in tests. */
export function clearPrefetchCache(): void {
	prefetchCache.clear();
	preloadedModules.clear();
}

function compilePattern(pattern: string): RegExp {
	const parts = pattern.split('/').map((seg) => {
		if (!seg) return '';
		if (/^:(.+)\*$/.test(seg)) return '(.*)';
		if (/^:(.+)$/.test(seg)) return '([^/]+)';
		return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	});
	return new RegExp('^' + parts.join('/') + '/?$');
}

function matchRoute(pathname: string): RouteRecord | null {
	for (const { regex, rec } of compiled) {
		if (regex.test(pathname)) return rec;
	}
	return null;
}

/** Import all modules a route depends on (layouts outermost-first + page). Each module's
 * `defineWompo` calls execute as a side-effect, registering custom elements with the browser
 * so the subsequent `hydrate()` pass can attach to them. */
async function loadRouteModules(pathname: string): Promise<void> {
	const rec = matchRoute(pathname);
	if (!rec) return;
	for (const layout of rec.layouts) await import(/* @vite-ignore */ layout);
	await import(/* @vite-ignore */ rec.page);
}

/** Inject `<link rel="modulepreload">` for every module a route needs. Idempotent. */
function emitModulePreloads(pathname: string): void {
	if (typeof document === 'undefined') return;
	const rec = matchRoute(pathname);
	if (!rec) return;
	for (const url of [...rec.layouts, rec.page]) {
		if (preloadedModules.has(url)) continue;
		preloadedModules.add(url);
		const link = document.createElement('link');
		link.rel = 'modulepreload';
		link.href = url;
		document.head.appendChild(link);
	}
}

export async function navigate(href: string): Promise<void> {
	const url = new URL(href, window.location.href);
	if (url.origin !== window.location.origin) {
		window.location.href = url.href;
		return;
	}

	// Kick the module load + HTML fetch off in parallel; the network round-trip is the long pole.
	const modulesPromise = loadRouteModules(url.pathname);
	const htmlPromise = getOrFetchHtml(url.href);

	const swap = async () => {
		const [html] = await Promise.all([htmlPromise, modulesPromise]);
		const newDoc = new DOMParser().parseFromString(html, 'text/html');
		syncPageHead(newDoc);
		document.body.replaceWith(newDoc.body);
		hydrate(document);
		window.history.pushState({}, '', url.href);
		window.scrollTo(0, 0);
	};

	const startVT = (document as any).startViewTransition?.bind(document);
	if (startVT) {
		await startVT(swap).finished;
	} else {
		await swap();
	}
}

export function prefetchRoute(href: string, opts?: { preloadModules?: boolean }): void {
	const url = new URL(href, window.location.href);
	const key = url.href;
	// Reuse if cached and fresh; otherwise enqueue a new fetch.
	const existing = prefetchCache.get(key);
	if (existing && existing.expiresAt > Date.now()) {
		// Even on a cache hit, make sure we've emitted modulepreloads.
		if (opts?.preloadModules !== false) emitModulePreloads(url.pathname);
		return;
	}
	const htmlPromise = fetchPage(key);
	prefetchCache.set(key, { html: htmlPromise, expiresAt: Date.now() + prefetchTtlMs });
	htmlPromise.catch(() => prefetchCache.delete(key));
	// Warm the modules + emit modulepreload tags in parallel.
	loadRouteModules(url.pathname).catch(() => {
		/* swallow */
	});
	if (opts?.preloadModules !== false) emitModulePreloads(url.pathname);
}

/** Used by navigate() — reuses a cached prefetch when possible. */
function getOrFetchHtml(href: string): Promise<string> {
	const cached = prefetchCache.get(href);
	if (cached && cached.expiresAt > Date.now()) return cached.html;
	const p = fetchPage(href);
	prefetchCache.set(href, { html: p, expiresAt: Date.now() + prefetchTtlMs });
	p.catch(() => prefetchCache.delete(href));
	return p;
}

async function fetchPage(href: string): Promise<string> {
	const r = await fetch(href, {
		headers: { 'X-Seawomp-Nav': '1' },
		credentials: 'same-origin',
	});
	if (!r.ok) throw new Error(`Navigation fetch failed: ${r.status}`);
	return r.text();
}

/** Mirror the per-page `[data-seawomp-head]` elements from the freshly-fetched document into the
 * live one, so title/meta tags stay in sync across SPA navigations. */
function syncPageHead(newDoc: Document): void {
	const frag = Array.from(newDoc.head.querySelectorAll('[data-seawomp-head]'))
		.map((el) => el.outerHTML)
		.join('');
	applyHead(frag);
}

if (typeof window !== 'undefined') {
	window.addEventListener('popstate', async () => {
		const startVT = (document as any).startViewTransition?.bind(document);
		const swap = async () => {
			const pathname = window.location.pathname;
			const [html] = await Promise.all([
				getOrFetchHtml(window.location.href),
				loadRouteModules(pathname),
			]);
			const newDoc = new DOMParser().parseFromString(html, 'text/html');
			syncPageHead(newDoc);
			document.body.replaceWith(newDoc.body);
			hydrate(document);
		};
		if (startVT) await startVT(swap).finished;
		else await swap();
	});
}

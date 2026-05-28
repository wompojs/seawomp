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
import { useEffect, useSelf, useState, type WompoElement } from 'wompo';
import { applyHead } from './head.js';
import { setClientI18nConfig } from '../i18n/context.js';

export interface RouteRecord {
	pattern: string;
	page: string;
	layouts: string[];
}

export interface RouterI18nConfig {
	locales: string[];
	defaultLocale: string;
	detectBrowserLocale?: boolean;
}

export interface RouterViewTransitionOptions {
	/** Enable browser View Transitions for SPA navigations. Default: true. */
	enabled?: boolean;
	/** Optional class added to <html> for the duration of a transition, useful for custom CSS. */
	className?: string;
}

export interface RouterOptions {
	/** How long a successfully-prefetched HTML body stays warm. Default: 60 000 ms. */
	prefetchTtlMs?: number;
	/** Locale routing config. When set, client route matching strips locale prefixes. */
	i18n?: RouterI18nConfig;
	/** Browser View Transition behavior for SPA navigations. */
	viewTransitions?: boolean | RouterViewTransitionOptions;
}

export interface RouteSnapshot {
	href: string;
	pathname: string;
	search: string;
	hash: string;
	url: URL;
	params: Record<string, string>;
	route: RouteRecord | null;
}

interface CompiledRoute {
	regex: RegExp;
	paramNames: string[];
	rec: RouteRecord;
}

let routes: RouteRecord[] = [];
let compiled: CompiledRoute[] = [];

interface PrefetchEntry {
	html: Promise<string>;
	expiresAt: number;
}
const prefetchCache = new Map<string, PrefetchEntry>();
const preloadedModules = new Set<string>();

let prefetchTtlMs = 60_000;
let i18nConfig: RouterI18nConfig | undefined;
let viewTransitions: boolean | RouterViewTransitionOptions = true;
let lastCommittedUrl: URL | null =
	typeof window !== 'undefined' ? new URL(window.location.href) : null;
let currentRoute: RouteSnapshot | null =
	typeof window !== 'undefined' ? createRouteSnapshot(new URL(window.location.href)) : null;
const routeListeners = new Set<(route: RouteSnapshot) => void>();

/** Register the dev/build route table. Called once from the hydrate-entry bootstrap. */
export function setRoutes(rs: RouteRecord[]): void {
	routes = rs;
	compiled = rs.map((rec) => ({ ...compilePattern(rec.pattern), rec }));
	if (typeof window !== 'undefined') currentRoute = createRouteSnapshot(new URL(window.location.href));
}

/** Tunable router knobs — call before any prefetches if you want to override defaults. */
export function setRouterOptions(opts: RouterOptions): void {
	if (typeof opts.prefetchTtlMs === 'number') prefetchTtlMs = opts.prefetchTtlMs;
	if (opts.i18n) {
		i18nConfig = opts.i18n;
		setClientI18nConfig(opts.i18n);
		if (typeof window !== 'undefined') currentRoute = createRouteSnapshot(new URL(window.location.href));
	}
	if (opts.viewTransitions !== undefined) viewTransitions = opts.viewTransitions;
}

/** Drop the prefetch HTML cache. Mostly useful in tests. */
export function clearPrefetchCache(): void {
	prefetchCache.clear();
	preloadedModules.clear();
}

export function useRoute(initialHref?: string | URL): RouteSnapshot {
	const self = useSelf<WompoElement>();
	const [route, setRoute] = useState(() => getRouteSnapshot(initialHref));

	useEffect(() => {
		if (typeof window === 'undefined') return;
		let disposed = false;
		const sync = (next: RouteSnapshot) => {
			if (disposed || !self?.isConnected) return;
			setRoute(next);
		};
		routeListeners.add(sync);
		sync(getRouteSnapshot());
		return () => {
			disposed = true;
			routeListeners.delete(sync);
		};
	}, []);

	return route;
}

function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
	const paramNames: string[] = [];
	const parts = pattern.split('/').map((seg) => {
		if (!seg) return '';
		const catchAll = seg.match(/^:(.+)\*$/);
		if (catchAll) {
			paramNames.push(catchAll[1]);
			return '(.*)';
		}
		const dynamic = seg.match(/^:(.+)$/);
		if (dynamic) {
			paramNames.push(dynamic[1]);
			return '([^/]+)';
		}
		return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	});
	return { regex: new RegExp('^' + parts.join('/') + '/?$'), paramNames };
}

function matchRouteWithParams(pathname: string): {
	rec: RouteRecord;
	params: Record<string, string>;
} | null {
	const normalizedPathname = stripLocalePrefix(pathname);
	for (const { regex, rec, paramNames } of compiled) {
		const match = normalizedPathname.match(regex);
		if (!match) continue;
		const params: Record<string, string> = {};
		paramNames.forEach((name, index) => {
			params[name] = decodeParam(match[index + 1] || '');
		});
		return { rec, params };
	}
	return null;
}

function matchRoute(pathname: string): RouteRecord | null {
	return matchRouteWithParams(pathname)?.rec ?? null;
}

function getRouteSnapshot(href?: string | URL): RouteSnapshot {
	if (href !== undefined) return createRouteSnapshot(href);
	if (typeof window === 'undefined') return createRouteSnapshot('/');
	if (!currentRoute || currentRoute.href !== window.location.href) {
		currentRoute = createRouteSnapshot(new URL(window.location.href));
	}
	return currentRoute;
}

function createRouteSnapshot(href: string | URL): RouteSnapshot {
	const url =
		href instanceof URL
			? new URL(href.href)
			: new URL(
					href,
					typeof window !== 'undefined' ? window.location.href : 'https://seawomp.local',
				);
	const match = matchRouteWithParams(url.pathname);
	return {
		href: url.href,
		pathname: url.pathname,
		search: url.search,
		hash: url.hash,
		url,
		params: match?.params ?? {},
		route: match?.rec ?? null,
	};
}

function publishRoute(url: URL): RouteSnapshot {
	currentRoute = createRouteSnapshot(url);
	for (const listener of routeListeners) listener(currentRoute);
	return currentRoute;
}

function decodeParam(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
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

	const from = lastCommittedUrl ?? new URL(window.location.href);
	// Clicking a link to the page you're already on is a no-op: don't re-fetch, don't swap
	// the DOM, don't `pushState` (which would otherwise dirty the history stack with a
	// duplicate entry the user can't escape via the Back button). Comparison is on
	// pathname (trailing-slash normalized so `/foo` and `/foo/` match), search and hash —
	// `href` has already been localized by `<seawomp-link>` / `localizeHref()` before
	// reaching `navigate()`, so the check correctly identifies same-page clicks across
	// locales too.
	if (isSameUrl(url, from)) return;
	const currentRoute = matchRoute(from.pathname);
	const targetRoute = matchRoute(url.pathname);

	// Kick the module load + HTML fetch off in parallel; the network round-trip is the long pole.
	const modulesPromise = loadRouteModules(url.pathname);
	const htmlPromise = getOrFetchHtml(url.href);

	beginNavigation(from, url);
	let succeeded = false;
	try {
		const swap = async () => {
			const [html] = await Promise.all([htmlPromise, modulesPromise]);
			const newDoc = new DOMParser().parseFromString(html, 'text/html');
			syncPageHead(newDoc);
			syncDocumentAttributes(newDoc);
			const swapMode = swapDocument(newDoc, {
				fromPathname: from.pathname,
				toPathname: url.pathname,
				currentRoute,
				targetRoute,
			});
			window.history.pushState({}, '', url.href);
			lastCommittedUrl = new URL(url.href);
			publishRoute(lastCommittedUrl);
			hydrate(document);
			window.scrollTo(0, 0);
			emitNavigation(from, url, swapMode);
			succeeded = true;
		};

		await runWithViewTransition(swap);
	} finally {
		endNavigation(from, url, succeeded);
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

type SwapMode = 'route-view' | 'body';

interface SwapDocumentInput {
	fromPathname: string;
	toPathname: string;
	currentRoute: RouteRecord | null;
	targetRoute: RouteRecord | null;
}

const ROUTE_VIEW_SELECTOR = '[data-seawomp-route-view]';

function swapDocument(newDoc: Document, input: SwapDocumentInput): SwapMode {
	const currentView = document.querySelector(ROUTE_VIEW_SELECTOR);
	const nextView = newDoc.querySelector(ROUTE_VIEW_SELECTOR);
	const sameRouteShell =
		input.currentRoute &&
		input.targetRoute &&
		sameLayouts(input.currentRoute.layouts, input.targetRoute.layouts) &&
		getLocale(input.fromPathname) === getLocale(input.toPathname);

	if (sameRouteShell && currentView && nextView) {
		currentView.replaceWith(nextView);
		return 'route-view';
	}

	document.body.replaceWith(newDoc.body);
	return 'body';
}

function sameLayouts(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((layout, index) => layout === b[index]);
}

function syncDocumentAttributes(newDoc: Document): void {
	const nextLang = newDoc.documentElement.getAttribute('lang');
	if (nextLang) document.documentElement.lang = nextLang;

	const nextDir = newDoc.documentElement.getAttribute('dir');
	if (nextDir) document.documentElement.dir = nextDir;
	else document.documentElement.removeAttribute('dir');
}

function emitNavigation(from: URL, to: URL, swapMode: SwapMode): void {
	window.dispatchEvent(
		new CustomEvent('seawomp:navigated', {
			detail: {
				from: from.href,
				to: to.href,
				swap: swapMode,
			},
		}),
	);
}

/* ---------------------------- Navigation state ----------------------------
 *
 * Apps that want to render a skeleton/spinner during a slow SPA transition can subscribe to
 * `useNavigationState()` from an island, or listen for the `seawomp:navigation-start` /
 * `seawomp:navigated` / `seawomp:navigation-end` events directly. State is `'loading'` from the
 * moment `navigate()` is called until the swap completes (or fails), and `'idle'` otherwise. */

export type NavigationState = 'idle' | 'loading';

export interface NavigationSnapshot {
	state: NavigationState;
	from?: URL;
	to?: URL;
}

let navigationState: NavigationState = 'idle';
let navigationFrom: URL | null = null;
let navigationTo: URL | null = null;
const navigationListeners = new Set<(snap: NavigationSnapshot) => void>();

function emitNavigationState(): void {
	const snap = getNavigationSnapshot();
	for (const listener of navigationListeners) listener(snap);
}

function beginNavigation(from: URL, to: URL): void {
	navigationFrom = from;
	navigationTo = to;
	navigationState = 'loading';
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent('seawomp:navigation-start', {
				detail: { from: from.href, to: to.href },
			}),
		);
	}
	emitNavigationState();
}

function endNavigation(from: URL, to: URL, succeeded: boolean): void {
	navigationState = 'idle';
	navigationFrom = null;
	navigationTo = null;
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent('seawomp:navigation-end', {
				detail: { from: from.href, to: to.href, succeeded },
			}),
		);
	}
	emitNavigationState();
}

/** Read the current navigation snapshot (no subscription). */
export function getNavigationSnapshot(): NavigationSnapshot {
	const snap: NavigationSnapshot = { state: navigationState };
	if (navigationFrom) snap.from = navigationFrom;
	if (navigationTo) snap.to = navigationTo;
	return snap;
}

/** Wompo hook — returns the current navigation snapshot and re-renders the component every time
 * the navigation state changes. Use it inside an island to render a skeleton/spinner while a
 * route transition is in flight. */
export function useNavigationState(): NavigationSnapshot {
	const self = useSelf<WompoElement>();
	const [snap, setSnap] = useState(() => getNavigationSnapshot());

	useEffect(() => {
		if (typeof window === 'undefined') return;
		let disposed = false;
		const sync = (next: NavigationSnapshot) => {
			if (disposed || !self?.isConnected) return;
			setSnap(next);
		};
		navigationListeners.add(sync);
		sync(getNavigationSnapshot());
		return () => {
			disposed = true;
			navigationListeners.delete(sync);
		};
	}, []);

	return snap;
}

async function runWithViewTransition(swap: () => Promise<void>): Promise<void> {
	const options = normalizeViewTransitionOptions();
	const startVT = options.enabled ? (document as any).startViewTransition?.bind(document) : undefined;
	if (!startVT) {
		await swap();
		return;
	}

	if (options.className) document.documentElement.classList.add(options.className);
	try {
		await startVT(swap).finished;
	} finally {
		if (options.className) document.documentElement.classList.remove(options.className);
	}
}

function normalizeViewTransitionOptions(): { enabled: boolean; className?: string } {
	if (typeof viewTransitions === 'boolean') return { enabled: viewTransitions };
	return {
		enabled: viewTransitions.enabled ?? true,
		className: viewTransitions.className,
	};
}

/** Two URLs point at the same page (pathname normalized for trailing slash, plus search and
 * hash). Used by `navigate()` and the popstate handler to short-circuit same-URL navigations. */
function isSameUrl(a: URL, b: URL): boolean {
	return (
		normalizePathname(a.pathname) === normalizePathname(b.pathname) &&
		a.search === b.search &&
		a.hash === b.hash
	);
}

function normalizePathname(pathname: string): string {
	if (!pathname) return '/';
	return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function getLocale(pathname: string): string {
	if (!i18nConfig) return '';
	const first = pathname.split('/').filter(Boolean)[0];
	return first && i18nConfig.locales.includes(first) ? first : i18nConfig.defaultLocale;
}

function stripLocalePrefix(pathname: string): string {
	if (!i18nConfig) return pathname;
	const locale = getLocale(pathname);
	if (locale === i18nConfig.defaultLocale) return pathname;
	const prefix = '/' + locale;
	if (pathname === prefix) return '/';
	if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length);
	return pathname;
}

/** Document-level click delegation for plain `<a>` elements.
 *
 * `<seawomp-link>` already wires its own click handler with prefetch + navigate, but apps
 * routinely emit raw `<a>` markup (markdown content, third-party HTML, devs who just use a
 * native anchor). For those cases we need two behaviors that the platform alone doesn't give us
 * cleanly:
 *   1. Hash-only links (`href="#intro"`) should perform an in-page scroll, not be intercepted by
 *      anything else and certainly not trigger a full reload. We emulate the native behavior:
 *      update the URL hash and scroll the target into view.
 *   2. Same-origin path links should use the SPA router instead of a full document load — but
 *      only when the link isn't already inside a `<seawomp-link>` (which handles its own click).
 *
 * Cross-origin / mailto / tel / download / target-_blank / modifier-clicks fall through to the
 * browser default. */
function handleDelegatedAnchorClick(event: MouseEvent): void {
	if (event.defaultPrevented) return;
	if (event.button !== 0) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const target = event.target;
	if (!(target instanceof Element)) return;
	const anchor = target.closest('a');
	if (!anchor) return;
	if (anchor.target && anchor.target !== '_self') return;
	if (anchor.hasAttribute('download')) return;
	const rawHref = anchor.getAttribute('href');
	if (!rawHref) return;

	// 1) Hash-only link — keep the URL, scroll the target into view, don't touch history beyond
	// the native hash update (which the browser would do anyway for the URL bar).
	if (rawHref.startsWith('#')) {
		const id = decodeURIComponent(rawHref.slice(1));
		const targetEl = id ? document.getElementById(id) : null;
		if (!targetEl) return; // empty hash or missing target: let the browser do its default thing
		event.preventDefault();
		const url = new URL(window.location.href);
		if (url.hash !== rawHref) {
			url.hash = rawHref;
			window.history.pushState({}, '', url.href);
			publishRoute(new URL(window.location.href));
		}
		targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
		return;
	}

	// 2) Same-origin navigable link not already wrapped by <seawomp-link> — route through the SPA.
	if (rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('//')) {
		return;
	}
	if (anchor.closest('seawomp-link')) return; // handled by the component's own listener
	let url: URL;
	try {
		url = new URL(rawHref, window.location.href);
	} catch {
		return;
	}
	if (url.origin !== window.location.origin) return;
	event.preventDefault();
	void navigate(url.href);
}

if (typeof window !== 'undefined') {
	window.addEventListener('popstate', async () => {
		const from = lastCommittedUrl ?? new URL(window.location.href);
		const to = new URL(window.location.href);
		// Bail on hash-only pops — the URL changed but the page is the same; the
		// `hashchange` listener below publishes the route. Running the swap here would
		// re-fetch the page for nothing.
		if (
			from.origin === to.origin &&
			normalizePathname(from.pathname) === normalizePathname(to.pathname) &&
			from.search === to.search
		) {
			return;
		}
		beginNavigation(from, to);
		let succeeded = false;
		try {
			const swap = async () => {
				const pathname = to.pathname;
				const currentRoute = matchRoute(from.pathname);
				const targetRoute = matchRoute(pathname);
				const [html] = await Promise.all([
					getOrFetchHtml(to.href),
					loadRouteModules(pathname),
				]);
				const newDoc = new DOMParser().parseFromString(html, 'text/html');
				syncPageHead(newDoc);
				syncDocumentAttributes(newDoc);
				const swapMode = swapDocument(newDoc, {
					fromPathname: from.pathname,
					toPathname: pathname,
					currentRoute,
					targetRoute,
				});
				lastCommittedUrl = to;
				publishRoute(to);
				hydrate(document);
				emitNavigation(from, to, swapMode);
				succeeded = true;
			};
			await runWithViewTransition(swap);
		} finally {
			endNavigation(from, to, succeeded);
		}
	});

	window.addEventListener('hashchange', () => {
		publishRoute(new URL(window.location.href));
	});

	document.addEventListener('click', handleDelegatedAnchorClick);
}

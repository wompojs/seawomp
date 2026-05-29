/* <seawomp-link> — Wompo component for client-side navigation.
 *
 * Preferred usage (renders its own <a>):
 *   <${Link} href="/blog/1">Read</${Link}>
 *   <${Link} href="/work" prefetch="visible" class="cta">Work</${Link}>
 *   <${Link} href="/" locale="it">IT</${Link}>          // force a specific locale
 *   <${Link} href="https://github.com/..." target="_blank" rel="noopener">GitHub</${Link}>
 *
 * Backward compatible: when no `href` prop is provided, the legacy form is supported:
 *   <seawomp-link><a href="/blog/1">Read</a></seawomp-link>
 *
 * Internal hrefs are auto-prefixed with the active locale (from the SSR locale set by
 * render-page or, on the client, document.documentElement.lang). Pass `locale` explicitly
 * to override. External and special-scheme URLs are passed through.
 *
 * SSR design note: this module avoids calling wompo hooks during SSR because seawomp's
 * built-in components may load wompo from a different node_modules location than the host
 * app — when bundlers can't dedupe (e.g. with `--preserve-symlinks`), hook reads would
 * land on the wrong module instance. We compute the SSR href without hooks; client behavior
 * (prefetch, active state) runs via hooks during hydration where there's only one wompo.
 */
import { defineWompo, html, useEffect, useSelf, type WompoElement, type WompoProps } from 'wompo';
import { navigate, prefetchRoute } from '../runtime/router.js';
import {
	detectClientLocale,
	getActiveSsrLocale,
	getActiveSsrPath,
	getClientI18nConfig,
	localizeHref,
	type LocaleContextValue,
} from '../i18n/context.js';

type PrefetchMode = 'hover' | 'visible' | 'none';

const IS_SERVER = typeof window === 'undefined';

export interface SeawompLinkProps extends WompoProps {
	href?: string;
	/** Force the target locale (e.g. on a language switcher). Defaults to the active locale. */
	locale?: string;
	/** Set to `"path"` to make the resolved href follow the *current* URL pathname instead of the
	 * `href` prop. Combined with `locale`, this is the canonical language-switcher pattern:
	 * `<Link locale="it" follow="path">IT</Link>` always points to the current page in Italian,
	 * even after SPA navigations have changed the pathname. */
	follow?: 'path';
	target?: string;
	rel?: string;
	download?: string | boolean;
	title?: string;
	ariaLabel?: string;
	ariaCurrent?: string;
	prefetch?: PrefetchMode;
	prefetchDelay?: number | string;
	preloadModules?: boolean | string;
	active?: boolean;
}

type LinkElement = WompoElement<SeawompLinkProps>;

const DEFAULT_DELAY = 50;
let observer: IntersectionObserver | null = null;
const observed = new WeakMap<Element, { href: string; preloadModules: boolean }>();

function getObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === 'undefined') return null;
	if (observer) return observer;
	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const meta = observed.get(entry.target);
				if (!meta) continue;
				prefetchRoute(meta.href, { preloadModules: meta.preloadModules });
				observer?.unobserve(entry.target);
				observed.delete(entry.target);
			}
		},
		{ rootMargin: '200px' },
	);
	return observer;
}

function SeawompLink(props: SeawompLinkProps) {
	const {
		children,
		href,
		locale: localeOverride,
		follow,
		target,
		rel,
		download,
		title,
		ariaLabel,
		ariaCurrent,
	} = props;
	// `follow="path"` means "use the current pathname (stripped of any locale prefix) as the
	// effective href" — this is how a language switcher stays current without forcing the
	// containing component to be an island that re-renders on every navigation. The static
	// `href` prop still acts as the SSR fallback so the link is correct before hydration.
	const effectiveHref = follow === 'path' ? currentPathnameForLink() ?? href : href;
	const resolvedHref =
		effectiveHref !== undefined ? resolveHref(effectiveHref, localeOverride) : undefined;

	if (!IS_SERVER) {
		setupClientBehavior(props);
	}

	// `title` is not propagated to the inner <a> (would trigger a native tooltip on the link
	// area, which devs rarely want from a label-style prop). When `aria-label` isn't set we
	// fall back to `title` so the link still has an accessible name for screen readers.
	const accessibleLabel = ariaLabel ?? title;

	// The link owns its active state: when the caller doesn't force `ariaCurrent`, we mark
	// `aria-current="page"` whenever the resolved href points at the current page. Computed in
	// render on both server (active SSR path) and client (current location) so the hydrated
	// markup matches the SSR output; `syncActive` then keeps it in sync across SPA navigations.
	const effectiveAriaCurrent =
		ariaCurrent !== undefined ? ariaCurrent : resolveAriaCurrent(resolvedHref);

	if (resolvedHref === undefined) {
		// Legacy form: <seawomp-link><a href=...>...</a></seawomp-link>. The caller already
		// provided the anchor; we just pass children through so the click/prefetch behavior
		// (attached in setupClientBehavior) can find the existing <a>.
		return html`${children}`;
	}

	return html`
		<a
			href=${resolvedHref}
			target=${target}
			rel=${rel}
			download=${download}
			aria-label=${accessibleLabel}
			aria-current=${effectiveAriaCurrent}
			>${children}</a
		>
	`;
}

function setupClientBehavior(props: SeawompLinkProps) {
	const { prefetch, prefetchDelay, preloadModules, href, follow } = props;
	const self = useSelf<LinkElement>();

	// `follow="path"` links derive their href from `window.location.pathname`, so they need
	// to re-render whenever the pathname changes. The seawomp-link instance itself is an
	// island and re-runs its render on prop changes — but `follow="path"`'s computed href
	// isn't a prop, so we manually bump a hidden state value on every navigation.
	useEffect(() => {
		if (follow !== 'path' || typeof window === 'undefined') return;
		const bump = () => self.requestRender();
		window.addEventListener('seawomp:navigated', bump);
		window.addEventListener('popstate', bump);
		return () => {
			window.removeEventListener('seawomp:navigated', bump);
			window.removeEventListener('popstate', bump);
		};
	}, [follow]);

	useEffect(() => {
		const anchor = self.querySelector('a');
		if (!anchor) return;

		const mode = normalizePrefetchMode(prefetch ?? self.getAttribute('prefetch'));
		const delay = normalizeDelay(prefetchDelay ?? self.getAttribute('prefetch-delay'));
		const shouldPreloadModules = normalizeBoolean(
			preloadModules ?? self.getAttribute('preload-modules'),
			true,
		);
		let hoverTimer: number | undefined;

		const cancelHover = () => {
			if (hoverTimer !== undefined) {
				clearTimeout(hoverTimer);
				hoverTimer = undefined;
			}
		};
		const prefetchAnchor = () => {
			cancelHover();
			const href = anchor.getAttribute('href');
			if (!href || !isLocalNavigableHref(href)) return;
			hoverTimer = window.setTimeout(
				() => prefetchRoute(href, { preloadModules: shouldPreloadModules }),
				delay,
			);
		};
		const click = (event: MouseEvent) => {
			const href = anchor.getAttribute('href');
			if (!href || !isLocalNavigableHref(href)) return;
			if (
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey ||
				anchor.target ||
				anchor.hasAttribute('download')
			) {
				return;
			}
			event.preventDefault();
			navigate(href);
		};
		const syncActive = () => {
			const href = anchor.getAttribute('href');
			const active = href ? linkMatchesCurrentLocation(href) : false;
			self.updateProp('active', active ? true : false);
			if (active) {
				if (
					!anchor.hasAttribute('aria-current') ||
					anchor.getAttribute('aria-current') === 'false'
				) {
					anchor.setAttribute('aria-current', 'page');
					anchor.setAttribute('data-seawomp-active-managed', '');
				}
			} else if (
				anchor.hasAttribute('data-seawomp-active-managed') ||
				anchor.getAttribute('aria-current') === 'page'
			) {
				anchor.setAttribute('aria-current', 'false');
				anchor.removeAttribute('data-seawomp-active-managed');
			}
		};

		anchor.addEventListener('click', click);
		if (mode === 'hover') {
			self.addEventListener('mouseenter', prefetchAnchor);
			self.addEventListener('mouseleave', cancelHover);
			self.addEventListener('focusin', prefetchAnchor);
		} else if (mode === 'visible') {
			const href = anchor.getAttribute('href');
			const io = getObserver();
			if (href && isLocalNavigableHref(href) && io) {
				observed.set(self, { href, preloadModules: shouldPreloadModules });
				io.observe(self);
			}
		}

		syncActive();
		window.addEventListener('seawomp:navigated', syncActive);
		window.addEventListener('popstate', syncActive);

		return () => {
			cancelHover();
			anchor.removeEventListener('click', click);
			self.removeEventListener('mouseenter', prefetchAnchor);
			self.removeEventListener('mouseleave', cancelHover);
			self.removeEventListener('focusin', prefetchAnchor);
			if (observer && observed.has(self)) {
				observer.unobserve(self);
				observed.delete(self);
			}
			window.removeEventListener('seawomp:navigated', syncActive);
			window.removeEventListener('popstate', syncActive);
		};
	}, [prefetch, prefetchDelay, preloadModules, href]);
}

function resolveHref(href: string, localeOverride: string | undefined): string {
	const ctx = activeLocaleContext();
	if (!ctx) return href;
	const locale = localeOverride ?? ctx.locale;
	return localizeHref(href, locale, ctx.defaultLocale, ctx.locales);
}

function activeLocaleContext(): LocaleContextValue | null {
	if (IS_SERVER) return getActiveSsrLocale();
	const config = getClientI18nConfig();
	if (!config) return null;
	return {
		locale: detectClientLocale(),
		defaultLocale: config.defaultLocale,
		locales: config.locales,
	};
}

/** Strip a leading locale prefix from `pathname` using the active SSR/client locale config.
 * Mirrors `localizeHref`'s parsing so the round-trip
 * `localizeHref(stripLocaleFromPathname(p), locale, default, locales)` is well-defined. */
function stripLocaleFromPathname(pathname: string): string {
	const ctx = activeLocaleContext();
	if (!ctx) return pathname;
	const first = pathname.split('/').filter(Boolean)[0];
	if (!first || !ctx.locales.includes(first)) return pathname;
	const prefix = '/' + first;
	if (pathname === prefix) return '/';
	if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length);
	return pathname;
}

/** Effective pathname for a `follow="path"` link — `window.location.pathname` on the client,
 * undefined on the server (SSR can't know it generically; the caller falls back to `href`). */
function currentPathnameForLink(): string | undefined {
	if (IS_SERVER) return undefined;
	return stripLocaleFromPathname(window.location.pathname);
}

function normalizePrefetchMode(value: unknown): PrefetchMode {
	return value === 'visible' || value === 'none' ? value : 'hover';
}

function normalizeDelay(value: unknown): number {
	if (value === null || value === undefined || value === '') return DEFAULT_DELAY;
	const n = Number(value);
	return Number.isFinite(n) ? n : DEFAULT_DELAY;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	if (value === null || value === undefined || value === '') return fallback;
	if (value === false || value === 'false') return false;
	if (value === true || value === 'true') return true;
	return fallback;
}

function isLocalNavigableHref(href: string): boolean {
	if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
	if (href.startsWith('//')) return false;
	const url = new URL(href, window.location.href);
	return url.origin === window.location.origin;
}

function linkMatchesCurrentLocation(href: string): boolean {
	const url = new URL(href, window.location.href);
	return normalizePath(url.pathname) === normalizePath(window.location.pathname);
}

/** Render-time `aria-current` for a resolved href: `'page'` when it targets the page currently
 * being rendered, otherwise `undefined` (no attribute). On the server we compare against the
 * active SSR path; on the client, the live location. Only local path hrefs (`/…`) qualify. */
function resolveAriaCurrent(resolvedHref: string | undefined): string | undefined {
	if (resolvedHref === undefined || !resolvedHref.startsWith('/')) return undefined;
	if (IS_SERVER) {
		const activePath = getActiveSsrPath();
		if (!activePath) return undefined;
		return normalizePath(pathnameOnly(resolvedHref)) === normalizePath(activePath)
			? 'page'
			: undefined;
	}
	return linkMatchesCurrentLocation(resolvedHref) ? 'page' : undefined;
}

/** Strip query/hash so only the path portion is compared. */
function pathnameOnly(href: string): string {
	const idx = href.search(/[?#]/);
	return idx === -1 ? href : href.slice(0, idx);
}

function normalizePath(pathname: string): string {
	if (!pathname) return '/';
	return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

SeawompLink.css = `
	seawomp-link a {
		display: contents;
		color: inherit;
		text-decoration: inherit;
	}
`;

defineWompo(SeawompLink, { name: 'seawomp-link', cssModule: false, island: 'load' });
export default SeawompLink;

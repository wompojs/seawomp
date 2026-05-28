/* Virtual-module generation.
 *
 * In dev, the framework injects three pieces of JS into the document:
 *   1. The hydrate entry served at `/_hydrate.js`, which boots `wompo/hydrate`, registers the
 *      client router with the current route table, and dynamically imports the page + layout
 *      modules matching the initial URL.
 *   2. The route table itself (inlined into the hydrate entry).
 *   3. A tiny HMR client snippet that listens to the dev WebSocket and reloads on `'reload'`.
 *
 * These were Vite virtual modules (`virtual:seawomp/routes`, etc.) — with Bun we just produce
 * the JS as a string and serve it from the dev HTTP server.
 */
import type { RouteEntry } from '../server/routes.js';
import type { I18nConfig } from '../i18n/index.js';
import type { NavigationOptions } from '../config.js';

/** Convert an absolute file path to the dev URL the source-server exposes. */
export function srcUrl(abs: string): string {
	return '/_src' + (abs.startsWith('/') ? abs : '/' + abs);
}

interface HydrateEntryOptions {
	i18n?: I18nConfig;
	navigation?: NavigationOptions;
}

/** Build the hydrate-entry JS. Inlines the route table + the HMR client snippet. */
export function buildHydrateEntry(routes: RouteEntry[], opts: HydrateEntryOptions = {}): string {
	const records = routes.map((r) => ({
		pattern: r.pattern,
		page: srcUrl(r.pagePath),
		layouts: r.layoutPaths.map(srcUrl),
	}));
	const i18nConfig = opts.i18n ? JSON.stringify(opts.i18n) : 'null';
	const routerOptionsValue = {
		...(opts.i18n ? { i18n: opts.i18n } : {}),
		...(opts.navigation ? { viewTransitions: opts.navigation.viewTransitions } : {}),
	};
	const routerOptions = Object.keys(routerOptionsValue).length
		? `setRouterOptions(${JSON.stringify(routerOptionsValue)});`
		: '';

	// We import the framework runtime via /_dep so the client and SSR see exactly one copy of
	// every module. `seawomp/client` itself registers `<seawomp-link>` and `<seawomp-image>` as a
	// side-effect — no need to import them separately here.
	return `\
import { hydrate, setRoutes, setRouterOptions } from '/_dep/seawomp/client';

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
  const pathname = stripLocalePrefix(location.pathname);
  for (const r of routes) {
    if (compile(r.pattern).test(pathname)) {
      for (const layout of r.layouts) await import(layout);
      await import(r.page);
      break;
    }
  }
  hydrate(document);
}

bootstrap().catch((err) => console.error('[seawomp] hydrate failed:', err));

// HMR client: reconnect once on disconnect, ignore other errors.
(function () {
  try {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/__seawomp_hmr');
    ws.addEventListener('message', (e) => {
      if (e.data === 'reload') location.reload();
    });
  } catch (e) { /* ignore */ }
})();
`;
}

/** Convert an absolute file path to the dev URL the source-server exposes. */
export function srcUrl(abs) {
    return '/_src' + (abs.startsWith('/') ? abs : '/' + abs);
}
/** Build the hydrate-entry JS. Inlines the route table + the HMR client snippet. */
export function buildHydrateEntry(routes, opts = {}) {
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

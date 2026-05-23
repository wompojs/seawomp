/** Convert an absolute file path to the dev URL the source-server exposes. */
export function srcUrl(abs) {
    return '/_src' + (abs.startsWith('/') ? abs : '/' + abs);
}
/** Build the hydrate-entry JS. Inlines the route table + the HMR client snippet. */
export function buildHydrateEntry(routes) {
    const records = routes.map((r) => ({
        pattern: r.pattern,
        page: srcUrl(r.pagePath),
        layouts: r.layoutPaths.map(srcUrl),
    }));
    // We import the framework runtime via /_dep so the client and SSR see exactly one copy of
    // every module. `seawomp/client` itself registers `<seawomp-link>` and `<seawomp-image>` as a
    // side-effect — no need to import them separately here.
    return `\
import { hydrate, setRoutes } from '/_dep/seawomp/client';

const routes = ${JSON.stringify(records)};
setRoutes(routes);

function compile(pattern) {
  const parts = pattern.split('/').map((seg) => {
    if (!seg) return '';
    if (/^:(.+)\\*$/.test(seg)) return '(.*)';
    if (/^:(.+)$/.test(seg)) return '([^/]+)';
    return seg.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  });
  return new RegExp('^' + parts.join('/') + '/?$');
}

async function bootstrap() {
  const pathname = location.pathname;
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

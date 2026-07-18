/* Client hydrate-bootstrap body — shared verbatim by the production build
 * (`generateHydrateEntrySource`) and the dev server (`buildHydrateEntry`) so both environments
 * pick the initial route/special-route chunk identically.
 *
 * This is a source *string* injected into the generated hydrate entry. It expects these bindings
 * to already exist in the surrounding module scope:
 *   - `routes`   — normal route records `{ pattern, page, layouts }` (chunk URLs).
 *   - `special`  — `{ notFound, error }`, each `{ page, layouts }` or `null` (chunk URLs).
 *   - `hydrate`, `canonicalPathname` — imported from the client runtime.
 *
 * Boot order:
 *   1. `data-seawomp-render` on `<html>` (set by the SSR shell for 404 / error renders) selects
 *      the matching special chunk directly — the URL alone can't identify an error render.
 *   2. Otherwise the current URL is matched against the normal route table.
 *   3. If nothing matches (e.g. a statically served `404.html` with no marker) we fall back to the
 *      notFound chunk so the layout + page islands still register.
 * In every branch the chunk import runs first (registering custom elements) before `hydrate()`.
 */
export const HYDRATE_BOOTSTRAP_BODY = `\
function compile(pattern) {
  const parts = pattern.split('/').map((seg) => {
    if (!seg) return '';
    if (/^:(.+)\\*$/.test(seg)) return '(.*)';
    if (/^:(.+)$/.test(seg)) return '([^/]+)';
    return seg.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  });
  return new RegExp('^' + parts.join('/') + '/?$');
}

async function importRecord(rec) {
  for (const layout of rec.layouts) await import(layout);
  await import(rec.page);
}

async function bootstrap() {
  const kind = document.documentElement.getAttribute('data-seawomp-render');
  if (kind === 'error' && special.error) {
    await importRecord(special.error);
  } else if (kind === 'not-found' && special.notFound) {
    await importRecord(special.notFound);
  } else {
    const pathname = canonicalPathname(location.pathname);
    let matched = false;
    for (const r of routes) {
      if (compile(r.pattern).test(pathname)) {
        await importRecord(r);
        matched = true;
        break;
      }
    }
    if (!matched && special.notFound) await importRecord(special.notFound);
  }
  hydrate(document);
}

bootstrap().catch((err) => console.error('[seawomp] hydrate failed:', err));`;

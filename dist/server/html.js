/* HTML document shell.
 *
 * The SSR result fills the BODY content. This module wraps it in a full `<!doctype html>` so the
 * dev/prod handler can pipe a single response. The shell is intentionally minimal — apps
 * customize via `app/layout.ts` and `app/page.ts`'s `head` export.
 */
export function openShell(opts = {}) {
    const { title = 'seawomp', headExtra = '', hydrateScript = '/_hydrate.js', lang = 'en' } = opts;
    return (`<!doctype html><html lang="${lang}"><head>` +
        `<meta charset="utf-8" />` +
        `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
        `<title>${escapeHtml(title)}</title>` +
        headExtra +
        `</head><body>`);
}
export function closeShell(hydrateScript = '/_hydrate.js') {
    return `<script type="module" src="${hydrateScript}"></script></body></html>`;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

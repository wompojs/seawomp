/* Google Fonts localization — shared string helpers.
 *
 * Both the build (SSG/prerender) and the runtime SSR path rewrite Google Fonts `<link>` tags to a
 * locally-hosted stylesheet so no page depends on fonts.googleapis.com at request time. The two
 * paths MUST agree on how a link is matched and what the replacement looks like, otherwise the
 * SPA head diff (`runtime/head.ts`, keyed on a link's resource identity) would treat the localized
 * link on a prerendered page and the one emitted by an SSR route as different resources — the very
 * asymmetry that breaks fonts when navigating from an SSR-only route (404/error) to a prerendered
 * one. Keeping the matching + the emitted tag here, used by both sides, guarantees they match.
 *
 * The build side (`build/fonts.ts`) resolves each Google Fonts href to a local asset by
 * downloading it; the runtime side (`build/serve-prod.ts`) resolves it via the `fonts` map baked
 * into the build manifest. This module owns everything except that resolution step.
 */
/** Remove `<link rel="preconnect">` hints pointing at Google's font hosts. Once the stylesheet is
 * served locally these preconnects warm a connection that's never used. */
export function stripGoogleFontPreconnects(html) {
    return html.replace(/<link\b(?=[^>]*rel=["']?preconnect["']?)(?=[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com["'])[^>]*>/gi, '');
}
/** Find every `<link rel="stylesheet" href="https://fonts.googleapis.com/css…">` in `html`. The
 * returned `href` is entity-decoded so it matches the (decoded) keys used by the build and the
 * manifest font map. */
export function findGoogleFontLinks(html) {
    const out = [];
    const re = /<link\b(?=[^>]*rel=["']?stylesheet["']?)[^>]*>/gi;
    let match;
    while ((match = re.exec(html))) {
        const href = attrValue(match[0], 'href');
        if (!href)
            continue;
        const decoded = href.replace(/&amp;/g, '&');
        if (/^https:\/\/fonts\.googleapis\.com\/css2?\?/i.test(decoded)) {
            out.push({ tag: match[0], href: decoded });
        }
    }
    return out;
}
/** The canonical replacement tag for a localized Google Fonts stylesheet. Emitted identically by
 * the build and the runtime so the SPA head diff keeps the live `<link>` in place across a
 * navigation between a prerendered page and an SSR-rendered one. */
export function localFontLinkTag(localHref) {
    return `<link rel="stylesheet" href="${escapeAttr(localHref)}" data-seawomp-font="local">`;
}
/** Rewrite Google Fonts links in `html` to their localized equivalents using `map` (decoded
 * Google Fonts href → local `/_assets/fonts/…` href), also stripping the now-unneeded preconnect
 * hints. Pure and synchronous — no network, no filesystem — so it's safe on the SSR hot path.
 * Links whose href has no entry in `map` are left untouched, as are documents with no Google Fonts
 * link at all (fast path). */
export function localizeGoogleFontsWithMap(html, map) {
    if (!map || !html.includes('fonts.googleapis.com'))
        return html;
    let out = stripGoogleFontPreconnects(html);
    for (const link of findGoogleFontLinks(out)) {
        const localHref = map[link.href];
        if (!localHref)
            continue;
        out = out.replace(link.tag, localFontLinkTag(localHref));
    }
    return out;
}
function attrValue(tag, name) {
    const quoted = new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, 'i').exec(tag);
    if (quoted)
        return quoted[2];
    const bare = new RegExp(`\\s${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
    return bare ? bare[1] : null;
}
function escapeAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

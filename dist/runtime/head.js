/* Helpers for updating the document head between navigations.
 *
 * Pages can export `head(props)` returning HTML fragments (e.g. `<title>…</title><meta…>`). The
 * server inlines them in the initial response; on SPA navigation we DIFF the head: elements that
 * are identical between the old and new fragments stay in place (no remove + re-add), so
 * `<link rel="stylesheet">` and the like don't briefly unload between pages — which would
 * otherwise cause a flash of unstyled content on every SPA transition.
 *
 * The diff key is the element's full `outerHTML` (after the framework marker is applied) for most
 * elements — cheap, deterministic, and matching what `head()` emits (stable strings derived from
 * props). `<link>` elements are the exception: they're keyed by their resource-identity attributes
 * (rel/href/…) only, so a live stylesheet is kept in place even when a third party (e.g. a consent-
 * management script) injects extra attributes like `data-cmp-info` onto it. Without this, the
 * injected attribute breaks the `outerHTML` match, the live `<link>` is removed and re-added every
 * navigation, and a `must-revalidate` resource re-fetches — causing a flash of unstyled content.
 * Anything not present in the new fragment is removed; anything new is appended.
 */
const HEAD_MARKER = 'data-seawomp-head';
// Attributes that define a <link>'s resource identity. Two links agreeing on all of these load the
// same thing, so the live node can be kept across navigations even if extra (non-identity)
// attributes were injected onto it after load.
const LINK_IDENTITY_ATTRS = ['rel', 'href', 'sizes', 'media', 'type', 'as', 'crossorigin', 'integrity', 'hreflang'];
/** Diff key for head reconciliation. Links key on resource identity; everything else on outerHTML. */
function diffKey(el) {
    if (el.tagName === 'LINK') {
        let key = 'link';
        for (const name of LINK_IDENTITY_ATTRS) {
            const value = el.getAttribute(name);
            if (value !== null)
                key += `\n${name}=${value}`;
        }
        return key;
    }
    return el.outerHTML;
}
/** Reconcile the document head's `[data-seawomp-head]` elements against `fragmentHtml`. */
export function applyHead(fragmentHtml) {
    const existing = Array.from(document.head.querySelectorAll(`[${HEAD_MARKER}]`));
    const desired = parseHeadFragment(fragmentHtml);
    // Index existing elements by their outerHTML so identical entries can be kept verbatim.
    const existingByKey = new Map();
    for (const el of existing) {
        const key = diffKey(el);
        const bucket = existingByKey.get(key);
        if (bucket)
            bucket.push(el);
        else
            existingByKey.set(key, [el]);
    }
    const keep = new Set();
    const toAppend = [];
    for (const node of desired) {
        const key = diffKey(node);
        const bucket = existingByKey.get(key);
        if (bucket && bucket.length > 0) {
            keep.add(bucket.shift());
        }
        else {
            toAppend.push(node);
        }
    }
    for (const el of existing) {
        if (!keep.has(el))
            el.remove();
    }
    for (const node of toAppend) {
        document.head.appendChild(node);
    }
}
/** Parse a head HTML fragment into top-level elements, each tagged with the framework marker. */
function parseHeadFragment(fragmentHtml) {
    if (!fragmentHtml)
        return [];
    const tpl = document.createElement('template');
    tpl.innerHTML = fragmentHtml;
    const out = [];
    for (const node of Array.from(tpl.content.childNodes)) {
        if (node instanceof Element) {
            node.setAttribute(HEAD_MARKER, '');
            out.push(node);
        }
    }
    return out;
}

/* Helpers for updating the document head between navigations.
 *
 * Pages can export `head(props)` returning HTML fragments (e.g. `<title>…</title><meta…>`). The
 * server inlines them in the initial response; on SPA navigation we DIFF the head: elements that
 * are identical between the old and new fragments stay in place (no remove + re-add), so
 * `<link rel="stylesheet">` and the like don't briefly unload between pages — which would
 * otherwise cause a flash of unstyled content on every SPA transition.
 *
 * The diff key is the element's full `outerHTML` (after the framework marker is applied). It's
 * cheap, deterministic, and matches what most apps actually emit from `head()` (stable strings
 * derived from props). Anything not present in the new fragment is removed; anything new is
 * appended.
 */
const HEAD_MARKER = 'data-seawomp-head';
/** Reconcile the document head's `[data-seawomp-head]` elements against `fragmentHtml`. */
export function applyHead(fragmentHtml) {
    const existing = Array.from(document.head.querySelectorAll(`[${HEAD_MARKER}]`));
    const desired = parseHeadFragment(fragmentHtml);
    // Index existing elements by their outerHTML so identical entries can be kept verbatim.
    const existingByKey = new Map();
    for (const el of existing) {
        const key = el.outerHTML;
        const bucket = existingByKey.get(key);
        if (bucket)
            bucket.push(el);
        else
            existingByKey.set(key, [el]);
    }
    const keep = new Set();
    const toAppend = [];
    for (const node of desired) {
        const key = node.outerHTML;
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

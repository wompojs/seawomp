/* Helpers for updating the document head between navigations.
 *
 * Pages can export `head(props)` returning HTML fragments (e.g. `<title>…</title><meta…>`). The
 * server inlines them in the initial response; on SPA navigation we replace the relevant nodes by
 * removing any element marked `data-seawomp-head` and inserting the new set.
 */
const HEAD_MARKER = 'data-seawomp-head';
/** Replace all `data-seawomp-head` elements in the document head with `fragmentHtml`. */
export function applyHead(fragmentHtml) {
    document.head.querySelectorAll(`[${HEAD_MARKER}]`).forEach((el) => el.remove());
    if (!fragmentHtml)
        return;
    const tpl = document.createElement('template');
    tpl.innerHTML = fragmentHtml;
    for (const node of Array.from(tpl.content.childNodes)) {
        if (node instanceof Element)
            node.setAttribute(HEAD_MARKER, '');
        document.head.appendChild(node);
    }
}

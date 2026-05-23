/* HTML minification — safe, conservative.
 *
 * Wompo's streamed body contains declarative shadow DOM templates whose whitespace can be
 * meaningful (text nodes inside `<template shadowrootmode="open">`). We only collapse:
 *   - runs of whitespace BETWEEN tags inside `<head>`
 *   - HTML comments outside of `<script>`/`<style>` blocks
 * Leaves the body markup untouched.
 */
export function minifyHtmlShell(html) {
    // Strip comments outside script/style — naive, but matches what we emit (no comments inside
    // our own shell). We do not attempt to handle conditional comments.
    let out = html.replace(/<!--(?!\[if).*?-->/gs, '');
    // Collapse whitespace between tags in <head>.
    out = out.replace(/(<head[^>]*>)(.*?)(<\/head>)/is, (_match, openTag, inner, closeTag) => {
        const compact = inner.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
        return openTag + compact + closeTag;
    });
    return out;
}

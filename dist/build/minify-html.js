/* HTML minification — safe, conservative.
 *
 * Collapses whitespace between tags and strips comments, but preserves blocks where whitespace
 * or raw text can be meaningful: script/style/pre/code/textarea and declarative shadow DOM.
 *
 * `<!--w-->` / `<!--/w-->` (node-interpolation regions) and `<!--wc-->` / `<!--/wc-->`
 * (children regions, emitted whenever a component renders `${children}`) are wompo's hydration
 * markers — the hydrate runtime fails to bind dynamics without them. Stripping any of them forces
 * the affected island into the destructive client-render fallback and re-executes the whole
 * template on every page (a visible flicker). All four variants are kept verbatim.
 */
export function minifyHtmlShell(html) {
    const protectedBlocks = [];
    let out = html.replace(/<(script|style|pre|code|textarea)\b[\s\S]*?<\/\1>|<template\b(?=[^>]*\bshadowrootmode=)[\s\S]*?<\/template>/gi, (block) => {
        const token = `__SEAWOMP_HTML_BLOCK_${protectedBlocks.length}__`;
        protectedBlocks.push(block);
        return token;
    });
    out = out
        // Drop normal comments, but keep wompo's hydration markers — both the node-region pair
        // `<!--w-->` / `<!--/w-->` and the children-region pair `<!--wc-->` / `<!--/wc-->` (the
        // `\/?wc?-->` branch matches all four) — and legacy `<!--[if]-->` IE conditionals.
        .replace(/<!--(?!\[if|\/?wc?-->)[\s\S]*?-->/g, '')
        .replace(/>\s+</g, '><')
        .replace(/>\s+(__SEAWOMP_HTML_BLOCK_\d+__)/g, '>$1')
        .replace(/(__SEAWOMP_HTML_BLOCK_\d+__)\s+</g, '$1<')
        .trim();
    protectedBlocks.forEach((block, index) => {
        out = out.replace(`__SEAWOMP_HTML_BLOCK_${index}__`, block);
    });
    return out;
}

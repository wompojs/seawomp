/* HTML minification — safe, conservative.
 *
 * Collapses whitespace between tags and strips comments, but preserves blocks where whitespace
 * or raw text can be meaningful: script/style/pre/code/textarea and declarative shadow DOM.
 *
 * `<!--w-->` and `<!--/w-->` are wompo's hydration markers — every dynamic node region in the
 * SSR output is bracketed by a pair, and the hydrate runtime fails to bind dynamics without
 * them. Stripping those would force every island into the destructive client-render fallback
 * and re-execute the whole template on every page. They're kept verbatim.
 */
export function minifyHtmlShell(html: string): string {
  const protectedBlocks: string[] = [];
  let out = html.replace(
    /<(script|style|pre|code|textarea)\b[\s\S]*?<\/\1>|<template\b(?=[^>]*\bshadowrootmode=)[\s\S]*?<\/template>/gi,
    (block) => {
      const token = `__SEAWOMP_HTML_BLOCK_${protectedBlocks.length}__`;
      protectedBlocks.push(block);
      return token;
    },
  );

  out = out
    // Drop normal comments, but keep wompo's `<!--w-->` / `<!--/w-->` hydration markers and
    // legacy `<!--[if]-->` IE conditionals.
    .replace(/<!--(?!\[if|\/?w-->)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/>\s+(__SEAWOMP_HTML_BLOCK_\d+__)/g, '>$1')
    .replace(/(__SEAWOMP_HTML_BLOCK_\d+__)\s+</g, '$1<')
    .trim();

  protectedBlocks.forEach((block, index) => {
    out = out.replace(`__SEAWOMP_HTML_BLOCK_${index}__`, block);
  });

  return out;
}

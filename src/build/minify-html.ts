/* HTML minification — safe, conservative.
 *
 * Collapses whitespace between tags, but preserves blocks where whitespace or raw text can be
 * meaningful: script/style/pre/code/textarea, declarative shadow DOM, and wompo island props
 * payloads (`<template data-wompo-props>` holds JSON — a `>\s+<` collapse inside a string value
 * would silently corrupt the hydration props).
 *
 * Comments are preserved VERBATIM — all of them, not just wompo's `<!--w-->`/`<!--/w-->`/
 * `<!--wc-->`/`<!--/wc-->` hydration markers. The wompo client template counts element AND
 * comment nodes when it adopts SSR'd DOM (hydration): stripping any comment that also exists in
 * a component's template (e.g. an authored `<!-- note -->`) shifts every subsequent node index
 * and forces the island into the destructive client-render fallback ("hydration mismatch"
 * warning + full re-render flicker). The bytes saved never justify that failure mode.
 *
 * Whitespace-only text nodes between tags are NOT walker-visible to wompo (its TreeWalker shows
 * elements + comments only), so `>\s+<` collapse is hydration-safe.
 */
export function minifyHtmlShell(html: string): string {
  const protectedBlocks: string[] = [];
  let out = html.replace(
    /<(script|style|pre|code|textarea)\b[\s\S]*?<\/\1>|<template\b(?=[^>]*\b(?:shadowrootmode=|data-wompo-props\b))[\s\S]*?<\/template>|<!--[\s\S]*?-->/gi,
    (block) => {
      const token = `__SEAWOMP_HTML_BLOCK_${protectedBlocks.length}__`;
      protectedBlocks.push(block);
      return token;
    },
  );

  out = out
    .replace(/>\s+</g, '><')
    .replace(/>\s+(__SEAWOMP_HTML_BLOCK_\d+__)/g, '>$1')
    .replace(/(__SEAWOMP_HTML_BLOCK_\d+__)\s+</g, '$1<')
    // Whitespace between two adjacent protected blocks (e.g. `<!--/w-->\n\t<!--w-->`).
    // Lookahead keeps the second token available for the next match in an A-B-C run.
    .replace(/(__SEAWOMP_HTML_BLOCK_\d+__)\s+(?=__SEAWOMP_HTML_BLOCK_)/g, '$1')
    .trim();

  protectedBlocks.forEach((block, index) => {
    // Function replacement: a plain-string replacement would interpret `$&`/`$$`/`$'`
    // sequences inside the protected block (scripts and JSON payloads can contain them).
    out = out.replace(`__SEAWOMP_HTML_BLOCK_${index}__`, () => block);
  });

  return out;
}

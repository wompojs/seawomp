export declare function normalizeSlashes(p: string): string;
/** Convert a file under `app/` into its URL pattern.
 *  app/page.ts           → /
 *  app/blog/page.ts      → /blog
 *  app/blog/[id]/page.ts → /blog/:id
 *  app/[...slug]/page.ts → /:slug*
 */
export declare function filePathToRoutePattern(relPath: string): string;
/** Compile a route pattern (e.g. `/blog/:id`) into a regex + ordered param names. */
export declare function compileRoutePattern(pattern: string): {
    regex: RegExp;
    paramNames: string[];
};

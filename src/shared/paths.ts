/* Path utilities shared between dev server, build, and the route scanner. */
import path from 'node:path';

export function normalizeSlashes(p: string): string {
  return p.split(path.sep).join('/');
}

/** Convert a file under `app/` into its URL pattern.
 *  app/page.ts           → /
 *  app/blog/page.ts      → /blog
 *  app/blog/[id]/page.ts → /blog/:id
 *  app/[...slug]/page.ts → /:slug*
 */
export function filePathToRoutePattern(relPath: string): string {
  const noExt = relPath.replace(/\.(ts|js|tsx|jsx)$/, '');
  const noPage = noExt.replace(/\/page$/, '').replace(/^page$/, '');
  if (!noPage) return '/';
  const segments = noPage.split('/').map((seg) => {
    const catchAll = seg.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) return `:${catchAll[1]}*`;
    const dynamic = seg.match(/^\[(.+)\]$/);
    if (dynamic) return `:${dynamic[1]}`;
    return seg;
  });
  return '/' + segments.join('/');
}

/** Compile a route pattern (e.g. `/blog/:id`) into a regex + ordered param names. */
export function compileRoutePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexParts = pattern.split('/').map((seg) => {
    if (!seg) return '';
    const catchAll = seg.match(/^:(.+)\*$/);
    if (catchAll) {
      paramNames.push(catchAll[1]);
      return '(.*)';
    }
    const dynamic = seg.match(/^:(.+)$/);
    if (dynamic) {
      paramNames.push(dynamic[1]);
      return '([^/]+)';
    }
    return escapeRegex(seg);
  });
  const regex = new RegExp('^' + regexParts.join('/') + '/?$');
  return { regex, paramNames };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

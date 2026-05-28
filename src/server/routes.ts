/* File-based route scanner for the `app/` directory.
 *
 * Walks `app/` synchronously (the route table is small) and produces an array of
 * `RouteEntry` records describing each page, the layouts that wrap it, and the optional
 * loader / error boundary. The pattern is derived from the file path via
 * `filePathToRoutePattern` so the URL space matches the file system.
 */
import fs from 'node:fs';
import path from 'node:path';
import { filePathToRoutePattern, normalizeSlashes } from '../shared/paths.js';

export interface RouteEntry {
  /** Canonical URL pattern, e.g. `/blog/:id`. */
  pattern: string;
  /** Absolute path of the `page.ts` file. */
  pagePath: string;
  /** Layouts that wrap this page, outermost first. */
  layoutPaths: string[];
  /** Absolute path of an adjacent `loader.ts`, if any. */
  loaderPath?: string;
  /** Absolute path of the nearest `error.ts`. */
  errorPath?: string;
}

export interface SpecialRouteEntry {
  /** Absolute path of the special page module (`404.ts` or `error.ts`). */
  pagePath: string;
  /** Layouts that wrap this page, currently the root layout when present. */
  layoutPaths: string[];
}

export interface SpecialRoutes {
  notFoundRoute?: SpecialRouteEntry;
  errorRoute?: SpecialRouteEntry;
}

const PAGE_RE = /^page\.(ts|tsx|js|jsx)$/;
const LAYOUT_RE = /^layout\.(ts|tsx|js|jsx)$/;
const LOADER_RE = /^loader\.(ts|tsx|js|jsx)$/;
const ERROR_RE = /^error\.(ts|tsx|js|jsx)$/;
const NOT_FOUND_RE = /^404\.(ts|tsx|js|jsx)$/;
/** Directory name like `(docs)` — a "route group" that organizes routes without contributing a
 * URL segment AND resets the inherited layout / error-boundary chain so its own `layout.ts`
 * (if any) becomes a new root. */
const GROUP_RE = /^\(.+\)$/;

interface ScanFrame {
  dir: string;            // absolute directory
  rel: string;            // relative to `app/`, with forward slashes
  layouts: string[];      // accumulated layout absolute paths
  errorPath?: string;     // nearest error.ts (inherited from ancestor when not overridden)
}

/** Scan an `app/` directory tree and return the discovered routes. */
export function scanRoutes(appDir: string): RouteEntry[] {
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) return [];
  const out: RouteEntry[] = [];
  const stack: ScanFrame[] = [{ dir: appDir, rel: '', layouts: [], errorPath: undefined }];

  while (stack.length) {
    const frame = stack.pop()!;
    const entries = fs.readdirSync(frame.dir, { withFileTypes: true });

    // Local layout / error / page / loader detection (file order is arbitrary).
    let localLayout: string | undefined;
    let localError: string | undefined = frame.errorPath;
    let localPage: string | undefined;
    let localLoader: string | undefined;
    const subdirs: string[] = [];

    for (const ent of entries) {
      const abs = path.join(frame.dir, ent.name);
      if (ent.isDirectory()) {
        subdirs.push(ent.name);
        continue;
      }
      if (PAGE_RE.test(ent.name)) localPage = abs;
      else if (LAYOUT_RE.test(ent.name)) localLayout = abs;
      else if (LOADER_RE.test(ent.name)) localLoader = abs;
      else if (ERROR_RE.test(ent.name)) localError = abs;
    }

    const layoutsForChildren = localLayout ? [...frame.layouts, localLayout] : frame.layouts;

    if (localPage) {
      const pageRel = frame.rel ? `${frame.rel}/page` : 'page';
      out.push({
        pattern: filePathToRoutePattern(pageRel),
        pagePath: localPage,
        layoutPaths: layoutsForChildren,
        loaderPath: localLoader,
        errorPath: localError,
      });
    }

    for (const subdir of subdirs) {
      const isGroup = GROUP_RE.test(subdir);
      stack.push({
        dir: path.join(frame.dir, subdir),
        rel: isGroup ? frame.rel : frame.rel ? `${frame.rel}/${subdir}` : subdir,
        layouts: isGroup ? [] : layoutsForChildren,
        errorPath: isGroup ? undefined : localError,
      });
    }
  }

  // Sort: static segments before dynamic segments (so /blog/new wins over /blog/:id).
  out.sort((a, b) => routeScore(b.pattern) - routeScore(a.pattern));
  return out.map((r) => ({
    ...r,
    pagePath: normalizeSlashes(r.pagePath),
    layoutPaths: r.layoutPaths.map(normalizeSlashes),
    loaderPath: r.loaderPath ? normalizeSlashes(r.loaderPath) : undefined,
    errorPath: r.errorPath ? normalizeSlashes(r.errorPath) : undefined,
  }));
}

export function scanSpecialRoutes(appDir: string): SpecialRoutes {
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) return {};

  let rootLayout: string | undefined;
  let notFoundPath: string | undefined;
  let errorPath: string | undefined;

  for (const ent of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const abs = path.join(appDir, ent.name);
    if (LAYOUT_RE.test(ent.name)) rootLayout = abs;
    else if (NOT_FOUND_RE.test(ent.name)) notFoundPath = abs;
    else if (ERROR_RE.test(ent.name)) errorPath = abs;
  }

  const layoutPaths = rootLayout ? [normalizeSlashes(rootLayout)] : [];
  return {
    notFoundRoute: notFoundPath
      ? { pagePath: normalizeSlashes(notFoundPath), layoutPaths }
      : undefined,
    errorRoute: errorPath
      ? { pagePath: normalizeSlashes(errorPath), layoutPaths }
      : undefined,
  };
}

function routeScore(pattern: string): number {
  // Higher score = more specific. Static segments worth more than dynamic; dynamic worth more
  // than catch-all.
  let score = 0;
  for (const seg of pattern.split('/').filter(Boolean)) {
    if (seg.endsWith('*')) score += 1;
    else if (seg.startsWith(':')) score += 10;
    else score += 100;
  }
  return score;
}

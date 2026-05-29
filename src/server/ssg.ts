/* Static-site generation.
 *
 * For each route whose page module exports `prerender = true` (single path) or
 * `prerender = string[]` (a list of parameter paths to materialize), invoke the regular request
 * handler against synthetic Fetch Requests and write the resulting HTML to
 * `outDir/<pathname>/index.html`.
 *
 * Dynamic routes (`/blog/:id`) cannot be statically generated without parameter values; the
 * `prerender` array must enumerate every URL to emit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHandler } from './handler.js';
import type { RouteEntry, SpecialRouteEntry } from './routes.js';
import type { RedirectRule } from '../config.js';
import type { PageModule, StaticPath } from '../types.js';
import { localizeUrl, type I18nConfig } from '../i18n/index.js';

export interface SsgOptions {
  routes: RouteEntry[];
  loadModule: (abs: string) => Promise<any>;
  outDir: string;
  origin?: string;
  hydrateScript?: string;
  title?: string;
  frameworkHead?: string;
  cwd?: string;
  redirects?: RedirectRule[];
  notFoundRoute?: SpecialRouteEntry;
  errorRoute?: SpecialRouteEntry;
  /** When set, locale prefixes are stripped before route matching and static
   * `prerender = true` routes are emitted once per configured locale. */
  i18n?: I18nConfig;
  transformHtml?: (html: string, pathname: string) => string | Promise<string>;
}

export interface SsgResult {
  written: string[];
  paths: string[];
  skipped: { pattern: string; reason: string }[];
}

export async function prerender(opts: SsgOptions): Promise<SsgResult> {
  const origin = opts.origin ?? 'http://localhost';
  const handler = createHandler({
    routes: opts.routes,
    loadModule: opts.loadModule,
    hydrateScript: opts.hydrateScript,
    title: opts.title,
    frameworkHead: opts.frameworkHead,
    cwd: opts.cwd ?? process.cwd(),
    redirects: opts.redirects,
    notFoundRoute: opts.notFoundRoute,
    errorRoute: opts.errorRoute,
    i18n: opts.i18n,
  });

  const written: string[] = [];
  const writtenPaths: string[] = [];
  const skipped: { pattern: string; reason: string }[] = [];

  for (const route of opts.routes) {
    const pageMod = (await opts.loadModule(route.pagePath)) as PageModule;
    const flag = pageMod.prerender;
    const basePaths = await staticPathsForRoute(route, pageMod);
    if (!basePaths) {
      if (flag === true && /:|\*/.test(route.pattern)) {
        skipped.push({
          pattern: route.pattern,
          reason: 'dynamic route: `prerender = true` requires `generateStaticPaths()` or a string[]',
        });
      } else if (flag) {
        skipped.push({ pattern: route.pattern, reason: 'invalid prerender value' });
      }
      continue;
    }

    // A static `prerender = true` route is locale-agnostic: the same page serves every locale,
    // so emit it once per configured locale (default unprefixed, others prefixed). Routes that
    // enumerate their own paths (`generateStaticPaths` / `prerender = string[]`) are responsible
    // for declaring any localized variants themselves, so they're left untouched.
    const autoLocalize = Boolean(opts.i18n) && flag === true && !pageMod.generateStaticPaths;
    const paths = autoLocalize ? localizeStaticPaths(basePaths, opts.i18n!) : basePaths;

    for (const p of paths) {
      const req = new Request(new URL(p, origin));
      const res = await handler(req);
      if (!res.ok) {
        skipped.push({ pattern: route.pattern, reason: `${p} → ${res.status}` });
        continue;
      }
      let html = await res.text();
      if (opts.transformHtml) html = await opts.transformHtml(html, p);
      const fileAbs = path.join(opts.outDir, p.replace(/^\//, ''), 'index.html');
      await fs.mkdir(path.dirname(fileAbs), { recursive: true });
      await fs.writeFile(fileAbs, html, 'utf-8');
      written.push(fileAbs);
      writtenPaths.push(p);
    }
  }

  return { written, paths: writtenPaths, skipped };
}

/** Expand each canonical (default-locale) path into one entry per configured locale. */
function localizeStaticPaths(paths: string[], i18n: I18nConfig): string[] {
  const out: string[] = [];
  for (const p of paths) {
    out.push(p);
    for (const locale of i18n.locales) {
      if (locale === i18n.defaultLocale) continue;
      out.push(localizeUrl(p, locale, i18n.defaultLocale));
    }
  }
  return out;
}

async function staticPathsForRoute(
  route: RouteEntry,
  pageMod: PageModule,
): Promise<string[] | null> {
  if (pageMod.generateStaticPaths) {
    const generated = await pageMod.generateStaticPaths();
    return generated.map((entry) => normalizeStaticPath(entry, route.pattern));
  }

  const flag = pageMod.prerender;
  if (!flag) return null;
  if (flag === true) {
    if (/:|\*/.test(route.pattern)) return null;
    return [route.pattern];
  }
  if (Array.isArray(flag)) return flag.map((p) => normalizePath(p));
  return null;
}

function normalizeStaticPath(entry: StaticPath, pattern: string): string {
  if (typeof entry === 'string') return normalizePath(entry);
  if (entry.path) return normalizePath(entry.path);
  if (entry.params) return paramsToPath(pattern, entry.params);
  throw new Error('generateStaticPaths entries must include `path` or `params`');
}

function paramsToPath(
  pattern: string,
  params: Record<string, string | number | Array<string | number>>,
): string {
  const parts = pattern.split('/').map((segment) => {
    const catchAll = segment.match(/^:(.+)\*$/);
    if (catchAll) {
      const value = params[catchAll[1]];
      const values = Array.isArray(value) ? value : String(value ?? '').split('/');
      return values.map((part) => encodeURIComponent(String(part))).join('/');
    }
    const dynamic = segment.match(/^:(.+)$/);
    if (dynamic) return encodeURIComponent(String(params[dynamic[1]] ?? ''));
    return segment;
  });
  return normalizePath(parts.join('/'));
}

function normalizePath(pathname: string): string {
  if (!pathname.startsWith('/')) return '/' + pathname;
  return pathname;
}

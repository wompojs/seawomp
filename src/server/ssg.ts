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
import type { RouteEntry } from './routes.js';

export interface SsgOptions {
  routes: RouteEntry[];
  loadModule: (abs: string) => Promise<any>;
  outDir: string;
  origin?: string;
  hydrateScript?: string;
  title?: string;
  headExtra?: string;
  cwd?: string;
}

export interface SsgResult {
  written: string[];
  skipped: { pattern: string; reason: string }[];
}

export async function prerender(opts: SsgOptions): Promise<SsgResult> {
  const origin = opts.origin ?? 'http://localhost';
  const handler = createHandler({
    routes: opts.routes,
    loadModule: opts.loadModule,
    hydrateScript: opts.hydrateScript,
    title: opts.title,
    headExtra: opts.headExtra,
    cwd: opts.cwd ?? process.cwd(),
  });

  const written: string[] = [];
  const skipped: { pattern: string; reason: string }[] = [];

  for (const route of opts.routes) {
    const pageMod = (await opts.loadModule(route.pagePath)) as { prerender?: boolean | string[] };
    const flag = pageMod.prerender;
    if (!flag) continue;

    const isDynamic = /:|\*/.test(route.pattern);
    let paths: string[];
    if (flag === true) {
      if (isDynamic) {
        skipped.push({
          pattern: route.pattern,
          reason: 'dynamic route: `prerender = true` requires a string[] of param paths',
        });
        continue;
      }
      paths = [route.pattern];
    } else if (Array.isArray(flag)) {
      paths = flag;
    } else {
      skipped.push({ pattern: route.pattern, reason: 'invalid prerender value' });
      continue;
    }

    for (const p of paths) {
      const req = new Request(new URL(p, origin));
      const res = await handler(req);
      if (!res.ok) {
        skipped.push({ pattern: route.pattern, reason: `${p} → ${res.status}` });
        continue;
      }
      const html = await res.text();
      const fileAbs = path.join(opts.outDir, p.replace(/^\//, ''), 'index.html');
      await fs.mkdir(path.dirname(fileAbs), { recursive: true });
      await fs.writeFile(fileAbs, html, 'utf-8');
      written.push(fileAbs);
    }
  }

  return { written, skipped };
}

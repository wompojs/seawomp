/* Tests for the build manifest helpers. */
import { describe, expect, it } from 'bun:test';
import {
  emptyManifest,
  manifestFromRoutes,
  serializeManifest,
} from '../../src/server/manifest.js';
import type { RouteEntry } from '../../src/server/routes.js';

describe('manifest', () => {
  it('emptyManifest is well-formed', () => {
    const m = emptyManifest();
    expect(m.routes).toEqual([]);
    expect(m.islands).toEqual({});
    expect(m.hydrateRuntime).toBe('/_hydrate.js');
  });

  it('manifestFromRoutes maps route entries to manifest entries', () => {
    const routes: RouteEntry[] = [
      { pattern: '/', pagePath: '/abs/page.ts', layoutPaths: ['/abs/layout.ts'] },
      { pattern: '/blog/:id', pagePath: '/abs/blog/page.ts', layoutPaths: [] },
    ];
    const m = manifestFromRoutes(routes);
    expect(m.routes).toHaveLength(2);
    expect(m.routes[0].pattern).toBe('/');
    expect(m.routes[0].page).toBe('/abs/page.ts');
    expect(m.routes[0].layouts).toEqual(['/abs/layout.ts']);
    expect(m.routes[1].pattern).toBe('/blog/:id');
  });

  it('serializes to round-trippable JSON', () => {
    const m = manifestFromRoutes([
      { pattern: '/x', pagePath: '/p.ts', layoutPaths: [] },
    ]);
    const text = serializeManifest(m);
    const parsed = JSON.parse(text);
    expect(parsed.routes[0].pattern).toBe('/x');
  });
});

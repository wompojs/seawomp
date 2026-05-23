/* API-route scanner + dispatcher tests. */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanApiRoutes, compileApiRoutes, dispatchApi } from '../../src/server/api-router.js';

const FIXTURE_PARENT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.tmp-api');
let tmpRoot: string;

beforeEach(() => {
  fs.mkdirSync(FIXTURE_PARENT, { recursive: true });
  tmpRoot = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'a-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(rel: string, content: string) {
  const abs = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

const loadModule = (abs: string) => import(pathToFileURL(abs).href);

describe('scanApiRoutes', () => {
  it('returns [] when api/ is missing', () => {
    expect(scanApiRoutes(tmpRoot)).toEqual([]);
  });

  it('finds plain and dynamic routes', () => {
    write('api/health/route.ts', '');
    write('api/users/[id]/route.ts', '');
    write('api/posts/[...slug]/route.ts', '');
    const routes = scanApiRoutes(tmpRoot);
    const patterns = routes.map((r) => r.pattern).sort();
    expect(patterns).toEqual(['/api/health', '/api/posts/:slug*', '/api/users/:id']);
  });

  it('sorts static segments before dynamic', () => {
    write('api/x/new/route.ts', '');
    write('api/x/[id]/route.ts', '');
    const routes = scanApiRoutes(tmpRoot);
    const i = routes.findIndex((r) => r.pattern === '/api/x/new');
    const j = routes.findIndex((r) => r.pattern === '/api/x/:id');
    expect(i).toBeLessThan(j);
  });
});

describe('dispatchApi', () => {
  it('invokes the handler matching the verb', async () => {
    write(
      'api/health/route.ts',
      `export const GET = () => new Response('ok');`,
    );
    const compiled = compileApiRoutes(scanApiRoutes(tmpRoot));
    const res = await dispatchApi(new Request('http://x/api/health'), compiled, loadModule);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe('ok');
  });

  it('passes URL params to the handler', async () => {
    write(
      'api/echo/[name]/route.ts',
      `export const GET = ({ params }) => new Response(params.name);`,
    );
    const compiled = compileApiRoutes(scanApiRoutes(tmpRoot));
    const res = await dispatchApi(new Request('http://x/api/echo/lorenzo'), compiled, loadModule);
    expect(await res!.text()).toBe('lorenzo');
  });

  it('returns 405 with Allow header when the verb is missing', async () => {
    write(
      'api/health/route.ts',
      `export const GET = () => new Response('ok');`,
    );
    const compiled = compileApiRoutes(scanApiRoutes(tmpRoot));
    const res = await dispatchApi(
      new Request('http://x/api/health', { method: 'POST' }),
      compiled,
      loadModule,
    );
    expect(res!.status).toBe(405);
    expect(res!.headers.get('allow')).toBe('GET');
  });

  it('returns null for an unmatched path', async () => {
    write('api/foo/route.ts', `export const GET = () => new Response('x');`);
    const compiled = compileApiRoutes(scanApiRoutes(tmpRoot));
    const res = await dispatchApi(new Request('http://x/api/bar'), compiled, loadModule);
    expect(res).toBeNull();
  });
});

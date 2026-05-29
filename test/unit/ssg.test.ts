/* Tests for the prerender (SSG) helper. */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanRoutes } from '../../src/server/routes.js';
import { prerender } from '../../src/server/ssg.js';

// Fixtures live inside the project so `import 'wompo'` resolves via local node_modules.
const FIXTURE_PARENT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.tmp-ssg');

let tmpRoot: string;
let outDir: string;

beforeEach(() => {
  fs.mkdirSync(FIXTURE_PARENT, { recursive: true });
  tmpRoot = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'in-'));
  outDir = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'out-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
});

function write(rel: string, content: string) {
  const abs = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const loadModule = (abs: string) => import(pathToFileURL(abs).href);

describe('prerender', () => {
  it('writes index.html for static routes flagged with prerender=true', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function Home(){ return html\`<h1>static</h1>\`; }
       defineWompo(Home, { name: 'ssg-home' });
       export default Home;
       export const prerender = true;`,
    );
    const routes = scanRoutes(tmpRoot);
    const r = await prerender({ routes, loadModule, outDir });
    expect(r.written).toHaveLength(1);
    const written = fs.readFileSync(r.written[0], 'utf-8');
    expect(written).toContain('static');
    expect(path.basename(r.written[0])).toBe('index.html');
  });

  it('skips dynamic routes when prerender = true (no params given)', async () => {
    write(
      'blog/page.ts',
      `import { html, defineWompo } from 'wompo';
       function B({ params }){ return html\`<b>\${params.id}</b>\`; }
       defineWompo(B, { name: 'ssg-blog' });
       export default B;
       export const prerender = true;`,
    );
    // pretend the route is dynamic (manually patch the pattern)
    const routes = scanRoutes(tmpRoot);
    routes[0].pattern = '/blog/:id';
    const r = await prerender({ routes, loadModule, outDir });
    expect(r.written).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/dynamic/);
  });

  it('honors prerender = [paths]', async () => {
    write(
      'blog/page.ts',
      `import { html, defineWompo } from 'wompo';
       function B({ params }){ return html\`<b>id=\${params.id}</b>\`; }
       defineWompo(B, { name: 'ssg-blogp' });
       export default B;
       export const prerender = ['/blog/1', '/blog/2'];`,
    );
    const routes = scanRoutes(tmpRoot);
    routes[0].pattern = '/blog/:id';
    const r = await prerender({ routes, loadModule, outDir });
    expect(r.written).toHaveLength(2);
    const strip = (s: string) => s.replace(/<!--\/?w-->/g, '');
    const file1 = strip(fs.readFileSync(path.join(outDir, 'blog/1/index.html'), 'utf-8'));
    const file2 = strip(fs.readFileSync(path.join(outDir, 'blog/2/index.html'), 'utf-8'));
    expect(file1).toContain('id=1');
    expect(file2).toContain('id=2');
  });

  it('prerenders static routes with loaders when prerender=true', async () => {
    write(
      'docs/page.ts',
      `import { html, defineWompo } from 'wompo';
       function Docs({ data }){ return html\`<article>\${data.title}</article>\`; }
       defineWompo(Docs, { name: 'ssg-docs-loader' });
       export default Docs;
       export const prerender = true;`,
    );
    write('docs/loader.ts', `export function loader(){ return { title: 'Markdown doc' }; }`);
    const routes = scanRoutes(tmpRoot);
    const r = await prerender({ routes, loadModule, outDir });
    expect(r.written).toHaveLength(1);
    expect(r.paths).toEqual(['/docs']);
    expect(fs.readFileSync(path.join(outDir, 'docs/index.html'), 'utf-8')).toContain('Markdown doc');
  });

  it('emits one file per locale for static prerender=true routes when i18n is set', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function Home({ data }){ return html\`<h1>\${data.locale}</h1>\`; }
       defineWompo(Home, { name: 'ssg-i18n-home' });
       export default Home;
       export const prerender = true;`,
    );
    write(
      'loader.ts',
      `export function loader({ url }) {
         const first = new URL(url).pathname.split('/').filter(Boolean)[0];
         const locale = first === 'it' ? 'it' : 'en';
         return { locale };
       }`,
    );
    const routes = scanRoutes(tmpRoot);
    const i18n = { locales: ['en', 'it'], defaultLocale: 'en' };
    const r = await prerender({ routes, loadModule, outDir, i18n });
    expect(r.paths.sort()).toEqual(['/', '/it']);
    expect(fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8')).toContain('en');
    const it = fs.readFileSync(path.join(outDir, 'it/index.html'), 'utf-8');
    expect(it).toContain('it');
    expect(it).toContain('lang="it"');
  });

  it('does not auto-localize routes that declare their own paths', async () => {
    write(
      'blog/page.ts',
      `import { html, defineWompo } from 'wompo';
       function B({ params }){ return html\`<b>\${params.id}</b>\`; }
       defineWompo(B, { name: 'ssg-i18n-blog' });
       export default B;
       export function generateStaticPaths() { return ['/blog/a', '/it/blog/b']; }`,
    );
    const routes = scanRoutes(tmpRoot);
    routes[0].pattern = '/blog/:id';
    const i18n = { locales: ['en', 'it'], defaultLocale: 'en' };
    const r = await prerender({ routes, loadModule, outDir, i18n });
    expect(r.paths.sort()).toEqual(['/blog/a', '/it/blog/b']);
  });

  it('uses generateStaticPaths for dynamic routes', async () => {
    write(
      'blog/page.ts',
      `import { html, defineWompo } from 'wompo';
       function B({ params }){ return html\`<b>id=\${params.id}</b>\`; }
       defineWompo(B, { name: 'ssg-static-paths' });
       export default B;
       export function generateStaticPaths() {
         return [{ params: { id: 'a' } }, '/blog/b'];
       }`,
    );
    const routes = scanRoutes(tmpRoot);
    routes[0].pattern = '/blog/:id';
    const r = await prerender({ routes, loadModule, outDir });
    expect(r.paths.sort()).toEqual(['/blog/a', '/blog/b']);
    expect(fs.existsSync(path.join(outDir, 'blog/a/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'blog/b/index.html'))).toBe(true);
  });
});

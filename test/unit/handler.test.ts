/* Integration test: route matching + layout composition + loader.
 *
 * Test fixtures live in a tmp dir but avoid filenames with brackets (`[id]`), which Vitest's
 * Vite-backed dynamic-import resolver mangles. The dynamic-pattern test instead supplies a
 * synthetic RouteEntry — the bracket → `:id` mapping itself is exercised by `routes.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanRoutes, type RouteEntry } from '../../src/server/routes.js';
import { createHandler } from '../../src/server/handler.js';

// Fixtures live inside the project so `import 'wompo'` from the generated `.ts` files resolves
// via the project's node_modules (Bun walks up from the importer's directory).
const FIXTURE_PARENT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.tmp-handler');

let tmpRoot: string;

beforeEach(() => {
  fs.mkdirSync(FIXTURE_PARENT, { recursive: true });
  tmpRoot = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'h-'));
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

const loadModule = async (abs: string) => import(pathToFileURL(abs).href);

const readBody = (res: Response) => res.text();

// strip wompo node-position markers and runtime style/script chrome for easier assertions
const stripMarkers = (s: string) => s.replace(/<!--\/?w-->/g, '');

describe('createHandler', () => {
  it('renders a root page', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function HomePage(){ return html\`<h1>home</h1>\`; }
       defineWompo(HomePage, { name: 'tu-home-page' });
       export default HomePage;`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/'));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body).toContain('home');
    expect(body).toContain('<tu-home-page');
  });

  it('passes URL params to the page via PageProps.params (synthetic route)', async () => {
    const pageAbs = write(
      'blog_id_page.ts',
      `import { html, defineWompo } from 'wompo';
       function Post({ params }){ return html\`<article>id=\${params.id}</article>\`; }
       defineWompo(Post, { name: 'tu-post' });
       export default Post;`,
    );
    const routes: RouteEntry[] = [
      { pattern: '/blog/:id', pagePath: pageAbs, layoutPaths: [] },
    ];
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/blog/42'));
    const body = stripMarkers(await readBody(res));
    expect(body).toContain('id=42');
  });

  it('runs the loader and passes data to the page', async () => {
    write(
      'items/page.ts',
      `import { html, defineWompo } from 'wompo';
       function Items({ data }){ return html\`<ul>\${data.list.map(x => html\`<li>\${x}</li>\`)}</ul>\`; }
       defineWompo(Items, { name: 'tu-items' });
       export default Items;`,
    );
    write(
      'items/loader.ts',
      `export async function loader(){ return { list: ['a','b','c'] }; }`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/items'));
    const body = stripMarkers(await readBody(res));
    expect(body).toContain('<li>a</li>');
    expect(body).toContain('<li>b</li>');
    expect(body).toContain('<li>c</li>');
  });

  it('wraps the page in nested layouts (outer first)', async () => {
    write(
      'layout.ts',
      `import { html, defineWompo } from 'wompo';
       function RootLayout({ children }){ return html\`<div class="outer">\${children}</div>\`; }
       defineWompo(RootLayout, { name: 'tu-root-l' });
       export default RootLayout;`,
    );
    write(
      'blog/layout.ts',
      `import { html, defineWompo } from 'wompo';
       function BlogLayout({ children }){ return html\`<section class="inner">\${children}</section>\`; }
       defineWompo(BlogLayout, { name: 'tu-blog-l' });
       export default BlogLayout;`,
    );
    write(
      'blog/page.ts',
      `import { html, defineWompo } from 'wompo';
       function BlogIndex(){ return html\`<h1>blog</h1>\`; }
       defineWompo(BlogIndex, { name: 'tu-blog-i' });
       export default BlogIndex;`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/blog'));
    const body = stripMarkers(await readBody(res));
    const outerIdx = body.indexOf('class="outer"');
    const innerIdx = body.indexOf('class="inner"');
    expect(outerIdx).toBeGreaterThan(-1);
    expect(innerIdx).toBeGreaterThan(-1);
    expect(outerIdx).toBeLessThan(innerIdx);
    expect(body).toContain('blog</h1>');
  });

  it('returns 404 for an unmatched path', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function P(){ return html\`<i>x</i>\`; }
       defineWompo(P, { name: 'tu-404-page' });
       export default P;`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/nope'));
    expect(res.status).toBe(404);
  });

  it('falls back to the default <title> when the page does not export head()', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function P(){ return html\`<i>x</i>\`; }
       defineWompo(P, { name: 'tu-head-default' });
       export default P;`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule, title: 'My App' });
    const body = await readBody(await h(new Request('http://x/')));
    expect(body).toContain('<title>My App</title>');
  });

  it('injects per-page head() output and suppresses the default <title>', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function P(){ return html\`<i>x</i>\`; }
       defineWompo(P, { name: 'tu-head-static' });
       export default P;
       export function head() {
         return '<title>Page Title</title><meta name="description" content="d"/>';
       }`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule, title: 'My App' });
    const body = await readBody(await h(new Request('http://x/')));
    expect(body).toContain('<title data-seawomp-head>Page Title</title>');
    // The default shell title must be suppressed so only one <title> is emitted.
    expect(body).not.toContain('<title>My App</title>');
    expect(body).toMatch(/<meta data-seawomp-head name="description" content="d"\s*\/?>/);
  });

  it('passes loader data + params to head() for dynamic routes', async () => {
    const pageAbs = write(
      'blog_slug_page.ts',
      `import { html, defineWompo } from 'wompo';
       function P({ data }){ return html\`<h1>\${data.title}</h1>\`; }
       defineWompo(P, { name: 'tu-head-dyn' });
       export default P;
       export function head({ params, data }) {
         return '<title>' + data.title + ' — ' + params.slug + '</title>';
       }`,
    );
    const loaderAbs = write(
      'blog_slug_loader.ts',
      `export async function loader({ params }) { return { title: 'Post ' + params.slug }; }`,
    );
    const routes: RouteEntry[] = [
      { pattern: '/blog/:slug', pagePath: pageAbs, layoutPaths: [], loaderPath: loaderAbs },
    ];
    const h = createHandler({ routes, loadModule });
    const body = await readBody(await h(new Request('http://x/blog/hello')));
    expect(body).toContain('<title data-seawomp-head>Post hello — hello</title>');
  });

  it('a `(group)` directory provides a fresh layout root for its subtree', async () => {
    write(
      'layout.ts',
      `import { html, defineWompo } from 'wompo';
       function RootLayout({ children }){ return html\`<div class="root-l">\${children}</div>\`; }
       defineWompo(RootLayout, { name: 'tu-root-grp' });
       export default RootLayout;`,
    );
    write(
      '(alt)/layout.ts',
      `import { html, defineWompo } from 'wompo';
       function AltLayout({ children }){ return html\`<section class="alt-l">\${children}</section>\`; }
       defineWompo(AltLayout, { name: 'tu-alt-grp' });
       export default AltLayout;`,
    );
    write(
      '(alt)/x/page.ts',
      `import { html, defineWompo } from 'wompo';
       function X(){ return html\`<h1>x</h1>\`; }
       defineWompo(X, { name: 'tu-x-grp' });
       export default X;`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/x'));
    expect(res.status).toBe(200);
    const body = stripMarkers(await readBody(res));
    expect(body).toContain('class="alt-l"');
    // Root layout must NOT be applied because the (alt) group reset the chain.
    expect(body).not.toContain('class="root-l"');
  });
});

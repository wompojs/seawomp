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
import { scanRoutes, scanSpecialRoutes, type RouteEntry } from '../../src/server/routes.js';
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
    expect(body).toContain('<seawomp-route-view data-seawomp-route-view>');
  });

  it('redirects unprefixed page requests to the preferred browser locale when configured', async () => {
    const h = createHandler({
      routes: [],
      loadModule,
      i18n: { locales: ['en', 'it'], defaultLocale: 'en', detectBrowserLocale: true },
    });
    const res = await h(
      new Request('http://x/docs/introduction', {
        headers: { accept: 'text/html', 'accept-language': 'it-IT,it;q=0.9,en;q=0.7' },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://x/it/docs/introduction');
    expect(res.headers.get('vary')).toBe('Accept-Language');
  });

  it('supports non-English default locales when redirecting from browser language', async () => {
    const h = createHandler({
      routes: [],
      loadModule,
      i18n: { locales: ['it', 'en'], defaultLocale: 'it', detectBrowserLocale: true },
    });
    const res = await h(
      new Request('http://x/', {
        headers: { accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://x/en');
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

  it('passes page props through to layouts', async () => {
    write(
      'layout.ts',
      `import { html, defineWompo } from 'wompo';
       function RootLayout({ children, data, params, url }) {
         return html\`<main data-layout-props="\${data.label}:\${params.id}:\${url.pathname}">\${children}</main>\`;
       }
       defineWompo(RootLayout, { name: 'tu-props-layout' });
       export default RootLayout;`,
    );
    const pageAbs = write(
      'item_page.ts',
      `import { html, defineWompo } from 'wompo';
       function Item({ data }){ return html\`<h1>\${data.label}</h1>\`; }
       defineWompo(Item, { name: 'tu-props-page' });
       export default Item;`,
    );
    const loaderAbs = write(
      'item_loader.ts',
      `export function loader({ params }) { return { label: 'item-' + params.id }; }`,
    );
    const routes: RouteEntry[] = [
      {
        pattern: '/item/:id',
        pagePath: pageAbs,
        layoutPaths: [path.join(tmpRoot, 'layout.ts')],
        loaderPath: loaderAbs,
      },
    ];
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/item/77'));
    const body = stripMarkers(await readBody(res));
    expect(body).toContain('data-layout-props="item-77:77:/item/77"');
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

  it('applies configured redirects before route matching', async () => {
    const h = createHandler({
      routes: [],
      loadModule,
      redirects: [
        { source: '/old/:slug*', destination: '/new/:slug*', status: 301 },
      ],
    });

    const res = await h(new Request('http://x/old/a/b?ref=1'));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/new/a/b?ref=1');
  });

  it('turns redirect() thrown by a loader into an HTTP redirect', async () => {
    write(
      'login/page.ts',
      `import { html, defineWompo } from 'wompo';
       function Login(){ return html\`<h1>login</h1>\`; }
       defineWompo(Login, { name: 'tu-login-page' });
       export default Login;`,
    );
    write(
      'private/page.ts',
      `import { html, defineWompo } from 'wompo';
       function Private(){ return html\`<h1>private</h1>\`; }
       defineWompo(Private, { name: 'tu-private-page' });
       export default Private;`,
    );
    write(
      'private/loader.ts',
      `import { redirect } from 'seawomp';
       export function loader(){ throw redirect('/login', 302); }`,
    );
    const h = createHandler({ routes: scanRoutes(tmpRoot), loadModule });
    const res = await h(new Request('http://x/private'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('renders app/404.ts for unmatched routes and notFound() thrown by a loader', async () => {
    write(
      'layout.ts',
      `import { html, defineWompo } from 'wompo';
       function Layout({ children }){ return html\`<main class="root">\${children}</main>\`; }
       defineWompo(Layout, { name: 'tu-404-layout' });
       export default Layout;`,
    );
    write(
      '404.ts',
      `import { html, defineWompo } from 'wompo';
       function NotFound(){ return html\`<h1>custom 404</h1>\`; }
       defineWompo(NotFound, { name: 'tu-custom-404' });
       export default NotFound;`,
    );
    write(
      'thing/page.ts',
      `import { html, defineWompo } from 'wompo';
       function Thing(){ return html\`<h1>thing</h1>\`; }
       defineWompo(Thing, { name: 'tu-thing-page' });
       export default Thing;`,
    );
    write(
      'thing/loader.ts',
      `import { notFound } from 'seawomp';
       export function loader(){ throw notFound(); }`,
    );
    const routes = scanRoutes(tmpRoot);
    const special = scanSpecialRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule, notFoundRoute: special.notFoundRoute });

    const unmatched = await h(new Request('http://x/missing'));
    expect(unmatched.status).toBe(404);
    expect(await unmatched.text()).toContain('custom 404');

    const thrown = await h(new Request('http://x/thing'));
    expect(thrown.status).toBe(404);
    const html = await thrown.text();
    expect(html).toContain('custom 404');
    expect(html).toContain('class="root"');
  });

  it('renders error.ts for loader failures', async () => {
    write(
      'error.ts',
      `import { html, defineWompo } from 'wompo';
       function ErrorPage({ error, status }){ return html\`<strong>error:\${status}:\${error.message}</strong>\`; }
       defineWompo(ErrorPage, { name: 'tu-error-page' });
       export default ErrorPage;`,
    );
    write(
      'bad/page.ts',
      `import { html, defineWompo } from 'wompo';
       function Bad(){ return html\`<h1>bad</h1>\`; }
       defineWompo(Bad, { name: 'tu-bad-page' });
       export default Bad;`,
    );
    write('bad/loader.ts', `export function loader(){ throw new Error('boom'); }`);
    const h = createHandler({ routes: scanRoutes(tmpRoot), loadModule });
    const res = await h(new Request('http://x/bad'));
    expect(res.status).toBe(500);
    expect(stripMarkers(await res.text())).toContain('error:500:boom');
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
         return html\`<title>Page Title</title><meta name="description" content="d">\`;
       }`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule, title: 'My App' });
    const body = await readBody(await h(new Request('http://x/')));
    expect(body).toContain('<title data-seawomp-head>Page Title</title>');
    // The default shell title must be suppressed so only one <title> is emitted.
    expect(body).not.toContain('<title>My App</title>');
    expect(body).toMatch(/<meta data-seawomp-head name="description" content="d"\s*>/);
  });

  it('passes loader data + params to head() for dynamic routes', async () => {
    const pageAbs = write(
      'blog_slug_page.ts',
      `import { html, defineWompo, unsafelyRenderString } from 'wompo';
       function P({ data }){ return html\`<h1>\${data.title}</h1>\`; }
       defineWompo(P, { name: 'tu-head-dyn' });
       export default P;
       export function head({ params, data }) {
         return html\`\${unsafelyRenderString('<title>' + data.title + ' — ' + params.slug + '</title>')}\`;
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

  it('composes layout head() before page head()', async () => {
    write(
      'layout.ts',
      `import { html, defineWompo } from 'wompo';
       function Layout({ children }){ return html\`<main>\${children}</main>\`; }
       defineWompo(Layout, { name: 'tu-head-layout' });
       export default Layout;
       export function head() {
         return html\`<meta name="layout-head" content="root">\`;
       }`,
    );
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function P(){ return html\`<i>x</i>\`; }
       defineWompo(P, { name: 'tu-head-page-order' });
       export default P;
       export function head() {
         return html\`<meta name="page-head" content="page">\`;
       }`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const body = await readBody(await h(new Request('http://x/')));
    const layoutIdx = body.indexOf('name="layout-head"');
    const pageIdx = body.indexOf('name="page-head"');
    expect(layoutIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(-1);
    expect(layoutIdx).toBeLessThan(pageIdx);
    expect(body).toContain('<meta data-seawomp-head name="layout-head" content="root"');
  });

  it('rejects string head() output', async () => {
    write(
      'page.ts',
      `import { html, defineWompo } from 'wompo';
       function P(){ return html\`<i>x</i>\`; }
       defineWompo(P, { name: 'tu-head-string' });
       export default P;
       export function head() {
         return '<title>bad</title>';
       }`,
    );
    const routes = scanRoutes(tmpRoot);
    const h = createHandler({ routes, loadModule });
    const res = await h(new Request('http://x/'));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('head()');
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

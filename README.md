# seawomp

A Web Component–first meta-framework built on top of [Wompo](https://github.com/wompojs/wompo),
**powered by [Bun](https://bun.com)**. File-based routing, nested layouts, async loaders,
server-side rendering with streaming Suspense, islands-first hydration, View Transitions,
hover/visibility prefetch with modulepreload, server actions, API routes, SSG, and an optimized
`<seawomp-image>` primitive with build-time WebP/AVIF variants.

## Status

Pre-1.0. The dev server, build pipeline (with JS/CSS/HTML minification), API routes, image
optimization, and client router are implemented and covered by `bun test` (37 tests across
8 files, ~280 ms).

## Requirements

- **Bun ≥ 1.1** (Bun ships native TypeScript, the dev server, the bundler, and the test runner —
  no Node, no Vite, no separate transpiler.)

## Quickstart — start a new seawomp project

```sh
bunx seawomp new my-app
cd my-app
bun run dev          # → http://localhost:5173
```

That's it. The scaffolder writes a complete starter (`seawomp.config.ts`, `app/layout.ts`,
home + about pages, a loader-driven `/posts` page, an `/api/health` route, and a global CSS
file with the `<seawomp-image>` resets), then runs `bun install` for you.

To skip the install step (e.g. in CI):

```sh
bunx seawomp new my-app --no-install
```

### What you get

```
my-app/
├── package.json             # bun scripts: dev / build / start
├── tsconfig.json
├── seawomp.config.ts
├── public/
│   └── global.css           # served at /global.css; minified at build time
└── app/
    ├── layout.ts            # root layout with <seawomp-link> nav
    ├── page.ts              # /  (home, prerendered)
    ├── about/page.ts        # /about (prerendered)
    ├── posts/
    │   ├── loader.ts        # async loader → page receives `data`
    │   └── page.ts          # /posts
    └── api/
        └── health/route.ts  # GET /api/health
```

### Run it

```sh
bun run dev          # → http://localhost:5173 (TS hot-reload, full-page reload on file change)
bun run build        # → .seawomp/ (minified JS, hashed CSS, WebP/AVIF image variants, SSG HTML)
bun run build:vercel # → .seawomp/ with public assets copied into Vercel static output
bun run start        # → serves the production build via Bun.serve
```

### Manual setup

If you'd rather scaffold by hand: see [Configuration reference](#configuration-reference-seawompconfigts)
below for the config shape, and copy the layout / page snippets from the [Pages](#pages) and
[API routes](#api-routes) sections.

## Project layout

```
my-app/
├── seawomp.config.ts
├── public/                  # served as static assets (raster images optimized at build)
│   ├── global.css
│   └── images/
└── app/
    ├── layout.ts            # root layout — wraps every page
    ├── page.ts              # /  (home)
    ├── blog/
    │   ├── layout.ts        # /blog/* — wrapped by both layouts
    │   └── [id]/
    │       ├── page.ts      # /blog/:id
    │       └── loader.ts    # async data loader for the page
    ├── dashboard/
    │   ├── page.ts
    │   └── error.ts         # error boundary inherited by descendants
    └── api/
        ├── health/route.ts            # GET /api/health
        └── posts/[id]/route.ts        # GET|POST|PUT … /api/posts/:id
```

Page / layout files default-export a Wompo component. A loader exports `loader(args)`. An API
route exports verb-keyed handlers (`GET`, `POST`, …). Pages may export `prerender: true` (or an
array of paths) to opt into SSG.

## Pages

```ts
// app/blog/[id]/page.ts
import { html, defineWompo } from 'wompo';
import type { PageProps } from 'seawomp';

function PostPage({ params, data }: PageProps<{ body: string }, { id: string }>) {
	return html`
		<article>
			<h1>Post ${params.id}</h1>
			<p>${data.body}</p>
		</article>
	`;
}
defineWompo(PostPage, { name: 'post-page' });
export default PostPage;
```

```ts
// app/blog/[id]/loader.ts
import type { LoaderArgs } from 'seawomp';

export async function loader({ params }: LoaderArgs<{ id: string }>) {
	const r = await fetch(`https://api.example.com/posts/${params.id}`);
	return await r.json();
}
```

### Per-page `<head>` — `export function head(props)`

Any page may export a `head` function that returns an HTML fragment (title, meta, link, …). It
receives the same `PageProps` as the component — including `data` from the adjacent loader — so
dynamic routes like `[id]/page.ts` can set per-record titles and meta:

```ts
// app/blog/[id]/page.ts (continued from above)
export function head({ params, data }: PageProps<{ title: string; excerpt: string }, { id: string }>) {
	return `
		<title>${data.title}</title>
		<meta name="description" content="${data.excerpt}" />
		<meta property="og:title" content="${data.title}" />
	`;
}
```

- Runs on the server during SSR and SSG; the resulting tags are tagged `data-seawomp-head`.
- On SPA navigation, the client router swaps every `[data-seawomp-head]` element with the new
  set — `document.title` updates without a full reload.
- If `head()` returns a `<title>`, the default shell `<title>` (from `seawomp.config.ts`) is
  suppressed so only one is emitted.
- Escape user-supplied values yourself — `head()` returns raw HTML, mirroring `headExtra`.

## Route groups — `(group)/` as a layout reset boundary

A directory whose name matches `(name)` is a **route group**. It organizes routes without
contributing to the URL path *and* resets the inherited layout / error-boundary chain — its own
`layout.ts` (if any) becomes a new root for the subtree:

```
app/
├── layout.ts            # site-wide root layout
├── page.ts              # /            → wrapped in app/layout.ts
├── about/page.ts        # /about       → wrapped in app/layout.ts
└── (docs)/
    ├── layout.ts        # fresh root, does NOT inherit app/layout.ts
    ├── error.ts         # fresh error boundary for the group
    └── docs/
        ├── page.ts      # /docs        → wrapped only in (docs)/layout.ts
        └── [slug]/page.ts # /docs/:slug → wrapped only in (docs)/layout.ts
```

Use it for marketing vs. app shells, docs vs. dashboard, or any section that needs a different
chrome from the rest of the site.

## API routes

Drop a `route.ts` anywhere under `app/api/`. Each file exports zero or more HTTP-verb handlers.
The router takes a Fetch `Request` and returns a Fetch `Response` — there is no extra abstraction
layer.

```ts
// app/api/posts/[id]/route.ts
import type { ApiHandler } from 'seawomp';

export const GET: ApiHandler<{ id: string }> = async ({ params }) => {
	const post = await db.posts.findById(params.id);
	return Response.json(post);
};

export const DELETE: ApiHandler<{ id: string }> = async ({ params }) => {
	await db.posts.remove(params.id);
	return new Response(null, { status: 204 });
};
```

| File                               | URL pattern         |
| ---------------------------------- | ------------------- |
| `app/api/hello/route.ts`           | `/api/hello`        |
| `app/api/users/[id]/route.ts`      | `/api/users/:id`    |
| `app/api/posts/[...slug]/route.ts` | `/api/posts/:slug*` |

Unsupported verbs against a matched route return **405** with the `Allow` header populated from
the file's exports. API routes are matched **before** pages so they never get shadowed.

## `<seawomp-image>` — optimized images

A first-class image custom element. SSR emits the tag as-is; on connect it builds a wrapper +
placeholder + `<img>` with `loading="lazy"` / `decoding="async"` by default.

```html
<seawomp-image src="/images/hero.jpg" alt="Studio Mono hero" ratio="16/9" priority> </seawomp-image>
```

| Attribute        | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `src`            | source URL (required)                                              |
| `alt`            | a11y text (required; warns in dev when missing)                    |
| `srcset`         | hand-pin a srcset; otherwise auto-built from the build manifest    |
| `sizes`          | passes through to `<img sizes>`                                    |
| `width`/`height` | numeric — used to reserve aspect-ratio space                       |
| `ratio`          | CSS aspect-ratio fallback (e.g. `"4/3"`)                           |
| `priority`       | boolean — `fetchpriority=high` + `loading=eager` + `decoding=sync` |
| `placeholder`    | `"blur"` (default) or `"none"`                                     |

### Build-time optimization (WebP / AVIF / srcset)

When `sharp` is installed as a peer dep, `seawomp build` walks `public/` and emits resized
variants for every raster image (`.jpg`, `.jpeg`, `.png`, `.webp`):

```sh
bun add sharp
```

```ts
// seawomp.config.ts
export default defineConfig({
	// …
	images: {
		sizes: [640, 960, 1280, 1920],
		formats: ['avif', 'webp'],
	},
});
```

Variants land in `.seawomp/static/_assets/img/`. The build also writes an `image-manifest.json`
that the prod server injects into `<head>` as `window.__SEAWOMP_IMAGES`; `<seawomp-image>` reads
it and populates `srcset` on connect — no markup change required. SVGs are passed through
unchanged.

### CSS (responsibility of the app)

The framework ships no CSS. Add this once to your global stylesheet:

```css
.seawomp-image__wrap {
	position: relative;
	display: block;
	overflow: hidden;
}
.seawomp-image__placeholder {
	position: absolute;
	inset: 0;
	background: #e5e5e5;
	transition: opacity 240ms ease;
}
.seawomp-image__wrap img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0;
	transition: opacity 380ms ease;
}
.seawomp-image--loaded img {
	opacity: 1;
}
.seawomp-image--loaded .seawomp-image__placeholder {
	opacity: 0;
}
```

## `<seawomp-link>` — client navigation with prefetch

Wraps an `<a>`, intercepts the click for SPA navigation, and prefetches the destination
proactively. Already registered by `seawomp/client` — no import required.

```html
<seawomp-link><a href="/work">Work</a></seawomp-link>

<seawomp-link prefetch="visible"><a href="/about">About</a></seawomp-link>

<seawomp-link prefetch="none" preload-modules="false">
	<a href="/expensive">Expensive</a>
</seawomp-link>
```

| Attribute         | Default | Effect                                                       |
| ----------------- | ------- | ------------------------------------------------------------ |
| `prefetch`        | `hover` | `hover` \| `visible` (IntersectionObserver) \| `none`        |
| `prefetch-delay`  | `50`    | hover debounce in ms                                         |
| `preload-modules` | `true`  | inject `<link rel="modulepreload">` for layout + page chunks |

What happens on hover:

1. After `prefetch-delay` ms, the destination URL is fetched (HTML) and cached.
2. The layout + page modules are dynamically imported so component definitions are registered.
3. `<link rel="modulepreload">` is appended to `<head>` for each module URL.
4. When the user actually clicks, `navigate()` reuses the cached HTML — no network round-trip.

Cached HTML expires after `prefetchTtlMs` (default 60 000 ms). Tune via:

```ts
import { setRouterOptions, clearPrefetchCache } from 'seawomp/client';
setRouterOptions({ prefetchTtlMs: 30_000 });
```

## Islands

A component becomes an island by passing `island: 'load' | 'idle' | 'visible'` to `defineWompo`,
or by placing `client:load|idle|visible` on the call site:

```ts
defineWompo(Counter, { name: 'my-counter', island: 'visible' });
// or in a template:
html`<${Counter} client:load start=${10} />`;
```

The server emits `data-wompo-island` + a `<template data-wompo-props>` carrying the initial
props (devalue-encoded — supports `Date`, `Map`, `Set`, `BigInt`, cyclic refs). The hydrate
runtime schedules each island per its mode.

## Server actions

```ts
import { defineAction } from 'wompo/ssr';

export const addItem = defineAction(async (name: string) => {
	// … hit a DB, queue, etc.
	return { id: 1, name };
});
```

The framework exposes `POST /_action/:id` automatically. On the client, the wrapped function
fetches that endpoint with the arguments encoded by devalue and parses the response.

## Streaming Suspense

```ts
import { Suspense, html, defineWompo, useAsync } from 'wompo';

function Slow() {
	const data = useAsync(() => fetch('/api/slow').then((r) => r.text()), []);
	return html`<p>${data ?? ''}</p>`;
}
defineWompo(Slow, { name: 'slow-c' });

function Page() {
	return html`
    <${Suspense} fallback=${html`<i>Loading…</i>`}>
      <${Slow} />
    </${Suspense}>
  `;
}
defineWompo(Page, { name: 'page-c' });
```

The shell (with the fallback inside `<wompo-boundary>`) is flushed first; once the async work
settles, an out-of-order `<template data-wompo-resolve>` chunk replaces the boundary in place.

## CLI

```sh
seawomp new <name>  # scaffold a new project (writes templates + runs `bun install`)
seawomp dev         # Bun.serve in dev mode — full TS, HMR via WebSocket (full-page reload)
seawomp build       # Bun.build + lightningcss + sharp → .seawomp/ (minified JS, CSS, HTML; SSG)
seawomp build --target vercel
seawomp vercel-build
seawomp start       # Bun.serve in production mode (serves .seawomp/static/_assets/* statically)
```

`seawomp new` accepts `--no-install` to skip the post-scaffold install step.

## Vercel deploy

Seawomp keeps hosting adapters separate from the core runtime. Local production still uses
`Bun.serve`; Vercel uses a small Hono adapter that delegates to the same production handler.

```ts
// src/server.ts
import { createVercelApp } from 'seawomp/adapters/vercel';

export default createVercelApp();
```

```json
{
	"$schema": "https://openapi.vercel.sh/vercel.json",
	"bunVersion": "1.x",
	"buildCommand": "bun run build:vercel",
	"outputDirectory": ".seawomp/static",
	"functions": {
		"src/server.ts": {
			"includeFiles": ".seawomp/**"
		}
	}
}
```

In a monorepo, keep `wompo`, `seawomp`, and the app in the same workspace and declare the app's
dependencies with `workspace:*` while the packages are not published. `seawomp` does not need to be
public on npm for Vercel, as long as Vercel can install it from the workspace or another private
package source.

## Configuration reference (`seawomp.config.ts`)

```ts
import { defineConfig } from 'seawomp/config';

export default defineConfig({
	appDir: 'app', // route file root (default 'app')
	publicDir: 'public', // static files root (default 'public')
	outDir: '.seawomp', // build output (default '.seawomp')
	port: 5173,
	title: 'My App',
	globalCss: 'public/global.css',
	headExtra: `<link rel="preconnect" href="…">`,
	images: {
		sizes: [640, 960, 1280, 1920],
		formats: ['avif', 'webp'],
		disabled: false,
	},
	minify: {
		js: true, // Bun.build minify (defaults: prod=true, dev=false)
		css: true, // lightningcss
		html: true, // collapse <head> whitespace
	},
});
```

## What Bun replaces vs. the previous Vite-based version

| Concern            | Before              | Now                                                                   |
| ------------------ | ------------------- | --------------------------------------------------------------------- |
| Dev HTTP server    | `vite.createServer` | `Bun.serve({ fetch, websocket })`                                     |
| TS / JSX transpile | Vite plugin chain   | `Bun.Transpiler` (per-file) + `Bun.build` (per-dependency)            |
| Module URLs        | `/@fs/<abs>`        | `/_src/<abs>` (transpiled) + `/_dep/<spec>` (bundled node_modules)    |
| Hydrate entry      | virtual module      | generated string served at `/_hydrate.js`                             |
| Bundling           | Vite build          | `Bun.build({ splitting: true, minify: true })`                        |
| CSS minify         | —                   | `lightningcss`                                                        |
| HMR                | Vite WS             | WebSocket on `/__seawomp_hmr` — full-page reload on any source change |
| Test runner        | vitest              | `bun test`                                                            |

## What's not (yet) in the MVP

- i18n
- Incremental Static Regeneration
- Module-level HMR (full-reload only today)
- Built-in browser e2e suite (Playwright spec is sketched but not wired)

## Repository layout

```
src/
├── cli.ts                    # bin — seawomp new|dev|build|start
├── scaffold.ts               # templates emitted by `seawomp new`
├── index.ts                  # public entry — re-exports types + defineConfig
├── config.ts                 # defineConfig, loadConfig, resolveConfig
├── types.ts                  # PageProps, LoaderArgs, ApiHandler, …
├── shared/paths.ts           # file-path → URL pattern, regex compiler
├── dev/
│   ├── server.ts             # Bun.serve dev entry
│   ├── source-server.ts      # /_src + /_dep transpile / bundle
│   ├── virtual.ts            # /_hydrate.js generator
│   └── hmr.ts                # WS reload broadcaster
├── server/
│   ├── handler.ts            # Fetch-API request handler (action → api → page → 404)
│   ├── render-page.ts        # layout composition + loader + renderToStream
│   ├── action-handler.ts     # POST /_action/:id
│   ├── api-router.ts         # scan + dispatch app/api/**/route.ts
│   ├── ssg.ts                # prerender pages flagged `prerender = true`
│   ├── manifest.ts           # route → asset map (build output)
│   ├── routes.ts             # `app/` scanner (page/layout/loader/error)
│   ├── html.ts               # document shell template
│   ├── static.ts             # public/ static-file server
│   └── index.ts              # public server entry
├── build/
│   ├── bundle.ts             # Bun.build orchestration (client + server)
│   ├── minify-css.ts         # lightningcss wrapper
│   ├── minify-html.ts        # safe head-only whitespace collapser
│   ├── images.ts             # sharp pipeline → WebP/AVIF/srcset
│   └── serve-prod.ts         # Bun.serve in prod mode
├── components/
│   ├── image.ts              # <seawomp-image>
│   └── index.ts              # barrel side-effect re-export
└── runtime/
    ├── index.ts              # public client entry
    ├── hydrate-entry.ts      # boots `wompo/hydrate` over the SSR'd document
    ├── router.ts             # navigate() + prefetch cache + modulepreload + View Transitions
    ├── link.ts               # <seawomp-link>
    ├── actions.ts            # callAction proxy
    └── head.ts               # data-seawomp-head bookkeeping
```

## License

MIT

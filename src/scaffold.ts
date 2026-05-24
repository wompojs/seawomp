/* Scaffolding for `seawomp new <name>` — emits a minimal but complete starter project that
 * exercises every framework feature: nested layout, page, second page, loader, API route,
 * <seawomp-image>, <seawomp-link>, server action, prerender flag, global CSS.
 *
 * The CLI invokes `scaffoldProject({ dir, name })` which creates the directory, writes the
 * templates, and (optionally) runs `bun install` inside it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ScaffoldOptions {
	/** Absolute path of the project directory to create. */
	dir: string;
	/** package.json `name`. */
	name: string;
	/** Skip the post-write `bun install` step. */
	skipInstall?: boolean;
}

/** Public entry — writes every template, then runs `bun install` unless told not to. */
export async function scaffoldProject(opts: ScaffoldOptions): Promise<void> {
	const { dir, name } = opts;
	// Refuse to clobber a non-empty target.
	try {
		const existing = await fs.readdir(dir);
		if (existing.length) {
			throw new Error(`target directory is not empty: ${dir}`);
		}
	} catch (err: any) {
		if (err.code !== 'ENOENT') throw err;
	}
	await fs.mkdir(dir, { recursive: true });

	const files = templates(name);
	for (const [rel, content] of Object.entries(files)) {
		const abs = path.join(dir, rel);
		await fs.mkdir(path.dirname(abs), { recursive: true });
		await fs.writeFile(abs, content, 'utf-8');
	}

	if (!opts.skipInstall) {
		console.log('[seawomp] installing dependencies…');
		const proc = Bun.spawn(['bun', 'install'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
		const code = await proc.exited;
		if (code !== 0) {
			console.warn(
				`[seawomp] bun install exited with code ${code} — finish manually with \`cd ${path.basename(dir)} && bun install\`.`,
			);
		}
	}

	const rel = path.relative(process.cwd(), dir) || '.';
	console.log(`\n  Created ${name} in ${rel}\n`);
	console.log('  Next steps:');
	if (rel !== '.') console.log(`    cd ${rel}`);
	console.log('    bun run dev      # start the dev server');
	console.log('    bun run build    # production build (.seawomp/)');
	console.log('    bun run start    # serve the production build');
	console.log('');
}

/** Returns every file the starter ships, keyed by relative path. */
function templates(name: string): Record<string, string> {
	return {
		'package.json': packageJson(name),
		'tsconfig.json': tsconfig(),
		'vercel.json': vercelJson(),
		'.gitignore': gitignore(),
		'README.md': readme(name),
		'seawomp.config.ts': seawompConfig(name),
		'src/server.ts': vercelServerTs(),
		'public/global.css': globalCss(),
		'app/layout.ts': layoutTs(),
		'app/page.ts': homePageTs(),
		'app/about/page.ts': aboutPageTs(),
		'app/posts/loader.ts': postsLoaderTs(),
		'app/posts/page.ts': postsPageTs(),
		'app/api/health/route.ts': apiHealthRouteTs(),
	};
}

function packageJson(name: string): string {
	return (
		JSON.stringify(
			{
				name,
				version: '0.1.0',
				private: true,
				type: 'module',
				scripts: {
					dev: 'seawomp dev',
					build: 'seawomp build',
					'build:vercel': 'seawomp build --target vercel',
					start: 'seawomp start',
				},
				dependencies: {
					wompo: '>=1.4.3',
					seawomp: '>=0.1.0',
				},
				devDependencies: {
					'@types/bun': 'latest',
					typescript: '^5.6.0',
				},
			},
			null,
			2,
		) + '\n'
	);
}

function vercelJson(): string {
	return (
		JSON.stringify(
			{
				$schema: 'https://openapi.vercel.sh/vercel.json',
				bunVersion: '1.x',
				buildCommand: 'bun run build:vercel',
				outputDirectory: '.seawomp/static',
				functions: {
					'src/server.ts': {
						includeFiles: '.seawomp/**',
					},
				},
			},
			null,
			2,
		) + '\n'
	);
}

function tsconfig(): string {
	return (
		JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2022',
					module: 'ES2022',
					moduleResolution: 'bundler',
					lib: ['ES2022', 'DOM'],
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					resolveJsonModule: true,
					allowSyntheticDefaultImports: true,
					isolatedModules: true,
					noEmit: true,
					types: ['@types/bun'],
				},
				include: ['app/**/*.ts', 'src/**/*.ts', 'seawomp.config.ts'],
			},
			null,
			2,
		) + '\n'
	);
}

function gitignore(): string {
	return ['node_modules', '.seawomp', 'bun.lock', '.DS_Store', '*.log', ''].join('\n');
}

function readme(name: string): string {
	return `# ${name}

A seawomp app — Web Components + SSR, powered by Bun.

## Commands

\`\`\`sh
bun run dev      # dev server (TS hot-reload, full-page reload on file change)
bun run build    # production build → .seawomp/
bun run start    # serve the production build
bun run build:vercel # production build for Vercel
\`\`\`

## Project layout

- \`app/\` — file-based routes. \`page.ts\` for pages, \`layout.ts\` for layouts,
  \`loader.ts\` for async data, \`api/**/route.ts\` for API endpoints.
- \`public/\` — static assets (auto-optimized at build when \`sharp\` is installed).
- \`src/server.ts\` — Vercel/Hono adapter entrypoint.
- \`seawomp.config.ts\` — framework config (title, globalCss, image variants, minify flags).

## Try it

After \`bun run dev\`:

- http://localhost:5173/           — home
- http://localhost:5173/about      — second page (SPA navigation)
- http://localhost:5173/posts      — async loader demo
- http://localhost:5173/api/health — API route
`;
}

function vercelServerTs(): string {
	return `import { createVercelApp } from 'seawomp/adapters/vercel';

export default createVercelApp();
`;
}

function seawompConfig(name: string): string {
	return `import { defineConfig } from 'seawomp/config';

export default defineConfig({
  title: '${name}',
  globalCss: 'public/global.css',
  port: 5173,
  // Uncomment + \`bun add sharp\` to enable WebP/AVIF generation:
  // images: { sizes: [640, 960, 1280, 1920], formats: ['avif', 'webp'] },
});
`;
}

function globalCss(): string {
	return `/* Minimal base styles + <seawomp-image> reset.
 * The framework ships no CSS; everything below is yours to edit. */

:root {
  --bg: #ffffff;
  --text: #0a0a0a;
  --text-muted: #6b7280;
  --accent: #2563eb;
  --surface: #f3f4f6;
  --border: #e5e7eb;
  --placeholder: var(--surface);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a0a0a;
    --text: #f3f4f6;
    --text-muted: #9ca3af;
    --surface: #1f2937;
    --border: #374151;
  }
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.container { max-width: 880px; margin: 0 auto; padding: 32px 24px; }
header.site { display: flex; gap: 24px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
header.site a { color: var(--text); font-weight: 500; }

/* <seawomp-image> styles (component renders the wrapper + placeholder + img; you style them) */
seawomp-image                         { display: block; }
.seawomp-image__wrap                  { position: relative; display: block; overflow: hidden; background: var(--placeholder); border-radius: 6px; }
.seawomp-image__placeholder           { position: absolute; inset: 0; background: var(--placeholder); transition: opacity 240ms ease; }
.seawomp-image__wrap img              { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 380ms ease; }
.seawomp-image--loaded img                                { opacity: 1; }
.seawomp-image--loaded .seawomp-image__placeholder         { opacity: 0; }
`;
}

function layoutTs(): string {
	return `/* Root layout — wraps every page. */
import { defineWompo, html, type WompoProps } from 'wompo';

function RootLayout({ children }: WompoProps) {
  return html\`
    <header class="site">
      <seawomp-link><a href="/">Home</a></seawomp-link>
      <seawomp-link><a href="/about">About</a></seawomp-link>
      <seawomp-link><a href="/posts">Posts</a></seawomp-link>
    </header>
    <main class="container">\${children}</main>
  \`;
}
defineWompo(RootLayout, { name: 'app-root-layout' });
export default RootLayout;
`;
}

function homePageTs(): string {
	return `/* / — home page. SSG: rendered to a static index.html at build time. */
import { defineWompo, html } from 'wompo';

function Home() {
  return html\`
    <h1>Hello from seawomp</h1>
    <p>
      This is your new seawomp app. Edit <code>app/page.ts</code> and the dev server reloads
      automatically. Click around — navigation between pages is intercepted by
      <code>&lt;seawomp-link&gt;</code> for instant SPA transitions.
    </p>
    <p>
      Routes scanned: this page (<code>/</code>), <seawomp-link><a href="/about">About</a></seawomp-link>,
      <seawomp-link><a href="/posts">Posts</a></seawomp-link>, and the API endpoint
      <a href="/api/health" target="_blank" rel="noreferrer">/api/health</a>.
    </p>
  \`;
}
defineWompo(Home, { name: 'app-home-page' });
export default Home;
export const prerender = true;

/* Per-page <head>: return raw HTML. Use \`{ params, data, url }\` for dynamic routes
 * (the loader's data is passed in, identical to the page component). */
export function head() {
  return \`
    <title>Home — seawomp</title>
    <meta name="description" content="A seawomp app." />
  \`;
}
`;
}

function aboutPageTs(): string {
	return `/* /about — a second page so you can see SPA navigation via <seawomp-link>. */
import { defineWompo, html } from 'wompo';

function About() {
  return html\`
    <h1>About</h1>
    <p>
      Every <code>&lt;seawomp-link&gt;</code> in the header prefetches its destination on hover
      (50ms debounce) and emits <code>&lt;link rel="modulepreload"&gt;</code> tags. Click and
      the swap is instant — the HTML and modules are already warm.
    </p>
    <p>
      Try <code>prefetch="visible"</code> on a link inside a long page to let the
      <code>IntersectionObserver</code> drive prefetch instead of hover.
    </p>
  \`;
}
defineWompo(About, { name: 'app-about-page' });
export default About;
export const prerender = true;
`;
}

function postsLoaderTs(): string {
	return `/* Async loader: runs server-side before the page renders. The return value is
 * passed to the page as \`data\` (typed via PageProps<TData>). */
import type { LoaderArgs } from 'seawomp';

export interface Post { id: number; title: string; body: string; }

export async function loader(_args: LoaderArgs): Promise<{ posts: Post[] }> {
  // Swap this with a real fetch / DB call. The loader runs in the SSR context — Bun has
  // \`fetch\` built in, so no extra setup is needed.
  return {
    posts: [
      { id: 1, title: 'Welcome to seawomp', body: 'File-based routing, no boilerplate.' },
      { id: 2, title: 'Server actions', body: 'Call typed server functions from the client.' },
      { id: 3, title: 'API routes',      body: 'Drop a route.ts under app/api/.' },
    ],
  };
}
`;
}

function postsPageTs(): string {
	return `/* /posts — data-driven page. The loader populates \`data\` automatically. */
import { defineWompo, html } from 'wompo';
import type { PageProps } from 'seawomp';
import type { Post } from './loader.js';

function Posts({ data }: PageProps<{ posts: Post[] }>) {
  return html\`
    <h1>Posts</h1>
    <ul>
      \${data.posts.map(
        (p) => html\`
          <li>
            <strong>\${p.title}</strong>
            <p>\${p.body}</p>
          </li>
        \`,
      )}
    </ul>
  \`;
}
defineWompo(Posts, { name: 'app-posts-page' });
export default Posts;
`;
}

function apiHealthRouteTs(): string {
	return `/* GET /api/health — minimal API route. */
import type { ApiHandler } from 'seawomp';

export const GET: ApiHandler = () => Response.json({ ok: true, time: new Date().toISOString() });
`;
}

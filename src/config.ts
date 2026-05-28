/* seawomp config layer.
 *
 * Apps export their config via `seawomp.config.ts`:
 *
 *   import { defineConfig } from 'seawomp/config';
 *   export default defineConfig({ title: 'My App' });
 *
 * `loadConfig(cwd)` finds and imports it; missing file → empty config (all defaults).
 */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { I18nConfig } from './i18n/index.js';
import type { RedirectStatus } from './server/http.js';

export interface ImageBuildOptions {
	/** Pixel widths to emit (longest edge). Default: [640, 960, 1280, 1920]. */
	sizes?: number[];
	/** Formats to emit (in addition to the source format kept as fallback). Default: ['avif','webp']. */
	formats?: ('webp' | 'avif')[];
	/** Disable the whole image pipeline (skip variant generation). Default: false. */
	disabled?: boolean;
}

export interface MinifyOptions {
	/** Minify JS output via Bun.build's `minify` option. Default: true in production. */
	js?: boolean;
	/** Reserved for framework-emitted CSS. Default: true in production. */
	css?: boolean;
	/** Collapse whitespace in the HTML shell. Default: true in production. */
	html?: boolean;
}

export interface LlmsTxtSection {
	title: string;
	links?: Array<string | { title: string; href: string; description?: string }>;
	body?: string;
}

export interface LlmsTxtOptions {
	/** Main heading. Defaults to config.title or the site origin. */
	title?: string;
	/** Intro paragraph below the heading. */
	description?: string;
	/** Extra free-form markdown/text appended after generated sections. */
	body?: string;
	/** Grouped links. When omitted, prerendered routes are listed under "Pages". */
	sections?: LlmsTxtSection[];
}

export interface RobotsTxtOptions {
	userAgent?: string;
	allow?: string[];
	disallow?: string[];
	/** Extra raw lines appended before sitemap entries. */
	extra?: string[];
	/** Include sitemap.xml / sitemap.txt URLs when siteUrl is configured. Default: true. */
	sitemap?: boolean;
}

export interface DiscoverabilityOptions {
	/** Generate /llms.txt. A string is written as raw content. */
	llmsTxt?: boolean | string | LlmsTxtOptions;
	/** Add <link rel="alternate" type="text/plain" href="/llms.txt"> when llmsTxt is enabled. */
	llmsLink?: boolean;
	/** Generate /sitemap.txt next to sitemap.xml. */
	sitemapTxt?: boolean;
	/** Generate /robots.txt. */
	robotsTxt?: boolean | RobotsTxtOptions;
}

export interface ViewTransitionOptions {
	/** Enable browser View Transitions for SPA navigations. Default: true. */
	enabled?: boolean;
	/** Optional class added to <html> for the duration of a transition, useful for custom CSS. */
	className?: string;
}

export interface NavigationOptions {
	/** Set false to disable the browser's default route cross-fade, or pass options for custom CSS. */
	viewTransitions?: boolean | ViewTransitionOptions;
}

export interface RedirectRule {
	/** Source pathname pattern, e.g. `/old`, `/blog/:slug`, or `/docs/:slug*`. */
	source: string;
	/** Destination URL or pathname. Dynamic params can be reused as `:slug` / `:slug*`. */
	destination: string;
	/** HTTP redirect status. Default: 307. */
	status?: RedirectStatus;
}

export interface SeawompConfig {
	/** Directory containing `page.ts`/`layout.ts`. Relative to project root. Default: `app`. */
	appDir?: string;
	/** Directory served statically (`/global.css`, `/images/...`). Default: `public`. */
	publicDir?: string;
	/** Override `<title>` for the document shell. */
	title?: string;
	/** Absolute production origin used for generated sitemap.xml. */
	siteUrl?: string;
	/** Dev server port. Default: 5173. */
	port?: number;
	/** Output directory for `seawomp build`. Default: `.seawomp`. */
	outDir?: string;
	images?: ImageBuildOptions;
	minify?: MinifyOptions;
	navigation?: NavigationOptions;
	discoverability?: DiscoverabilityOptions;
	/** Internationalisation settings. When set, the framework handles locale URL prefix routing. */
	i18n?: I18nConfig;
	/** Static redirect rules evaluated before API/page routing. */
	redirects?: RedirectRule[];
}

/** Identity function — gives editors a type-checked literal config object. */
export function defineConfig(c: SeawompConfig): SeawompConfig {
	return c;
}

const CONFIG_FILES = ['seawomp.config.ts', 'seawomp.config.js', 'seawomp.config.mjs'];

/** Locate the user's config file in `cwd` and import it. Missing file returns `{}`. */
export async function loadConfig(cwd: string): Promise<SeawompConfig> {
	for (const name of CONFIG_FILES) {
		const abs = path.join(cwd, name);
		if (!fs.existsSync(abs)) continue;
		const mod: any = await import(pathToFileURL(abs).href);
		const cfg = mod.default ?? mod;
		if (cfg && typeof cfg === 'object') return cfg as SeawompConfig;
	}
	return {};
}

/** Resolve config with defaults filled in. */
export interface ResolvedConfig extends Required<
	Omit<
		SeawompConfig,
		| 'title'
		| 'siteUrl'
		| 'images'
		| 'minify'
		| 'i18n'
		| 'navigation'
		| 'discoverability'
		| 'redirects'
	>
> {
	title?: string;
	siteUrl?: string;
	images: Required<ImageBuildOptions>;
	minify: Required<MinifyOptions>;
	navigation: Required<NavigationOptions>;
	discoverability: Required<Pick<DiscoverabilityOptions, 'llmsLink' | 'sitemapTxt'>> &
		Omit<DiscoverabilityOptions, 'llmsLink' | 'sitemapTxt'>;
	i18n?: I18nConfig;
	redirects: RedirectRule[];
}

export function resolveConfig(
	cwd: string,
	cfg: SeawompConfig,
	mode: 'dev' | 'build',
): ResolvedConfig {
	const prod = mode === 'build';
	return {
		appDir: path.resolve(cwd, cfg.appDir ?? 'app'),
		publicDir: path.resolve(cwd, cfg.publicDir ?? 'public'),
		port: cfg.port ?? 5173,
		outDir: path.resolve(cwd, cfg.outDir ?? '.seawomp'),
		title: cfg.title,
		siteUrl: cfg.siteUrl,
		images: {
			sizes: cfg.images?.sizes ?? [640, 960, 1280, 1920],
			formats: cfg.images?.formats ?? ['avif', 'webp'],
			disabled: cfg.images?.disabled ?? false,
		},
		minify: {
			js: cfg.minify?.js ?? prod,
			css: cfg.minify?.css ?? prod,
			html: cfg.minify?.html ?? prod,
		},
		navigation: {
			viewTransitions: cfg.navigation?.viewTransitions ?? true,
		},
		discoverability: {
			llmsTxt: cfg.discoverability?.llmsTxt,
			llmsLink: cfg.discoverability?.llmsLink ?? Boolean(cfg.discoverability?.llmsTxt),
			sitemapTxt: cfg.discoverability?.sitemapTxt ?? false,
			robotsTxt: cfg.discoverability?.robotsTxt,
		},
		i18n: cfg.i18n,
		redirects: cfg.redirects ?? [],
	};
}

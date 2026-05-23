/* seawomp config layer.
 *
 * Apps export their config via `seawomp.config.ts`:
 *
 *   import { defineConfig } from 'seawomp/config';
 *   export default defineConfig({ title: 'My App', globalCss: 'public/global.css' });
 *
 * `loadConfig(cwd)` finds and imports it; missing file → empty config (all defaults).
 */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

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
	/** Minify global CSS via lightningcss. Default: true in production. */
	css?: boolean;
	/** Collapse whitespace in the HTML shell. Default: true in production. */
	html?: boolean;
}

export interface SeawompConfig {
	/** Directory containing `page.ts`/`layout.ts`. Relative to project root. Default: `app`. */
	appDir?: string;
	/** Directory served statically (`/global.css`, `/images/...`). Default: `public`. */
	publicDir?: string;
	/** Override `<title>` for the document shell. */
	title?: string;
	/** Path of a global CSS file. Resolved against project root if relative. Inlined in `<head>`. */
	globalCss?: string;
	/** Raw HTML appended to `<head>` after the global CSS (fonts, meta tags, no-flash scripts…). */
	headExtra?: string;
	/** Dev server port. Default: 5173. */
	port?: number;
	/** Output directory for `seawomp build`. Default: `.seawomp`. */
	outDir?: string;
	images?: ImageBuildOptions;
	minify?: MinifyOptions;
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
	Omit<SeawompConfig, 'globalCss' | 'headExtra' | 'title' | 'images' | 'minify'>
> {
	globalCss?: string;
	headExtra?: string;
	title?: string;
	images: Required<ImageBuildOptions>;
	minify: Required<MinifyOptions>;
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
		globalCss: cfg.globalCss
			? path.isAbsolute(cfg.globalCss)
				? cfg.globalCss
				: path.resolve(cwd, cfg.globalCss)
			: undefined,
		headExtra: cfg.headExtra,
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
	};
}

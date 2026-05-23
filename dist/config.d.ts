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
export declare function defineConfig(c: SeawompConfig): SeawompConfig;
/** Locate the user's config file in `cwd` and import it. Missing file returns `{}`. */
export declare function loadConfig(cwd: string): Promise<SeawompConfig>;
/** Resolve config with defaults filled in. */
export interface ResolvedConfig extends Required<Omit<SeawompConfig, 'globalCss' | 'headExtra' | 'title' | 'images' | 'minify'>> {
    globalCss?: string;
    headExtra?: string;
    title?: string;
    images: Required<ImageBuildOptions>;
    minify: Required<MinifyOptions>;
}
export declare function resolveConfig(cwd: string, cfg: SeawompConfig, mode: 'dev' | 'build'): ResolvedConfig;

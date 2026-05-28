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
    links?: Array<string | {
        title: string;
        href: string;
        description?: string;
    }>;
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
export declare function defineConfig(c: SeawompConfig): SeawompConfig;
/** Locate the user's config file in `cwd` and import it. Missing file returns `{}`. */
export declare function loadConfig(cwd: string): Promise<SeawompConfig>;
/** Resolve config with defaults filled in. */
export interface ResolvedConfig extends Required<Omit<SeawompConfig, 'title' | 'siteUrl' | 'images' | 'minify' | 'i18n' | 'navigation' | 'discoverability' | 'redirects'>> {
    title?: string;
    siteUrl?: string;
    images: Required<ImageBuildOptions>;
    minify: Required<MinifyOptions>;
    navigation: Required<NavigationOptions>;
    discoverability: Required<Pick<DiscoverabilityOptions, 'llmsLink' | 'sitemapTxt'>> & Omit<DiscoverabilityOptions, 'llmsLink' | 'sitemapTxt'>;
    i18n?: I18nConfig;
    redirects: RedirectRule[];
}
export declare function resolveConfig(cwd: string, cfg: SeawompConfig, mode: 'dev' | 'build'): ResolvedConfig;

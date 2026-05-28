import type { ImageBuildOptions } from '../config.js';
export interface ImageVariant {
    /** URL the browser can fetch (under /_assets/img/). */
    src: string;
    /** MIME type — `image/webp`, `image/avif`, … */
    type: string;
    /** Pixel width of this variant. */
    width: number;
}
export interface ImageManifest {
    /** Maps source URL / public path (e.g. `/images/hero.png` or `https://…`) → variants. */
    [originalUrl: string]: ImageVariant[];
}
export interface BuildImagesOptions {
    publicDir: string;
    outAssetsDir: string;
    /** Public URL prefix the variants will be served from (e.g. `/_assets/img`). */
    publicPrefix: string;
    images: Required<ImageBuildOptions>;
    /** Project root used to resolve peer-optional image tooling such as sharp. */
    cwd?: string;
    /** Source directory to scan for remote image URLs (`<seawomp-image src="https://…">`). */
    appDir?: string;
}
/** Returns the manifest and the count of variants written. */
export declare function buildImages(opts: BuildImagesOptions): Promise<{
    manifest: ImageManifest;
    written: number;
}>;
export declare function writeOptimizedWebManifest(publicDir: string, staticDir: string, imageManifest: ImageManifest): Promise<boolean>;
/** Scan TS/JS files under `appDir` for static `src="https://…"` in <seawomp-image> tags. */
export declare function scanRemoteImageUrls(appDir: string): Promise<string[]>;

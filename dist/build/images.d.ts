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
    /** Maps source URL (e.g. `/images/p-fold-hero.png`) → list of generated variants. */
    [originalUrl: string]: ImageVariant[];
}
export interface BuildImagesOptions {
    publicDir: string;
    outAssetsDir: string;
    /** Public URL prefix the variants will be served from (e.g. `/_assets/img`). */
    publicPrefix: string;
    images: Required<ImageBuildOptions>;
}
/** Returns the manifest and the count of variants written. */
export declare function buildImages(opts: BuildImagesOptions): Promise<{
    manifest: ImageManifest;
    written: number;
}>;

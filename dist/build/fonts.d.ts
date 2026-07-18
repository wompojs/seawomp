export interface FontBuildContext {
    outAssetsDir: string;
    publicPrefix: string;
    /** Maps each decoded Google Fonts href to its localized `/_assets/fonts/…` asset (or `null`
     * when the download failed). Persisted to the manifest via `collectFontMap` so the runtime SSR
     * path can apply the same rewrite. */
    cache: Map<string, Promise<string | null>>;
    written: number;
}
export declare function createFontBuildContext(outAssetsDir: string): FontBuildContext;
export declare function localizeGoogleFontsInHtml(html: string, ctx: FontBuildContext): Promise<string>;
/** Resolve the accumulated font cache into a plain `{ decodedGoogleFontsHref → localAssetHref }`
 * map (dropping any that failed to download). Baked into the build manifest so the runtime SSR
 * path can apply the identical rewrite without re-downloading. Call after every HTML has been
 * localized. */
export declare function collectFontMap(ctx: FontBuildContext): Promise<Record<string, string>>;

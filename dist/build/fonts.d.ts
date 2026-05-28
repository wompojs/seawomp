export interface FontBuildContext {
    outAssetsDir: string;
    publicPrefix: string;
    cache: Map<string, Promise<string | null>>;
    written: number;
}
export declare function createFontBuildContext(outAssetsDir: string): FontBuildContext;
export declare function localizeGoogleFontsInHtml(html: string, ctx: FontBuildContext): Promise<string>;

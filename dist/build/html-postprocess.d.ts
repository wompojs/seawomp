export interface HtmlPostProcessOptions {
    minify?: boolean;
    optimizeLcp?: boolean;
}
export declare function postProcessHtml(html: string, opts?: HtmlPostProcessOptions): string;
export declare function optimizeLcpImage(html: string): string;

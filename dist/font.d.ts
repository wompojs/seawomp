import { type RenderHtml } from 'wompo';
export interface GoogleFontOptions {
    /** Font family name, for example `Inter` or `Source Sans 3`. */
    family: string;
    /** Font weights to request. Defaults to Google's regular style. */
    weights?: Array<string | number>;
    /** CSS font-display value. Default: `swap`. */
    display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
    /** Optional Google Fonts text subset. */
    text?: string;
}
export declare const Font: {
    google(options: GoogleFontOptions): RenderHtml;
};

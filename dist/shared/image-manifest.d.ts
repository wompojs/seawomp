export interface SsrImageVariant {
    /** URL the browser can fetch (under /_assets/img/). */
    src: string;
    /** MIME type — `image/webp`, `image/avif`, … */
    type: string;
    /** Pixel width of this variant. */
    width: number;
}
/** Maps original src (public path or remote URL) → generated variants. */
export type SsrImageManifest = Record<string, SsrImageVariant[]>;
/** Register the build image manifest for SSR renders. Pass `null` to clear. */
export declare function setSsrImageManifest(manifest: SsrImageManifest | null): void;
export declare function getSsrImageManifest(): SsrImageManifest | null;

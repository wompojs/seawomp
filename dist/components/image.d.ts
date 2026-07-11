import { type WompoProps } from 'wompo';
declare global {
    interface Window {
        /** Build manifest: maps original src → list of `[src, type, width]` triplets. */
        __SEAWOMP_IMAGES?: Record<string, {
            src: string;
            type: string;
            width: number;
        }[]>;
    }
}
export interface SeawompImageProps extends WompoProps {
    src?: string;
    alt?: string;
    srcset?: string;
    sizes?: string;
    width?: number | string;
    height?: number | string;
    /** CSS aspect-ratio value (e.g. "16/9"). Overrides width/height for ratio reservation. */
    ratio?: string;
    /** Eager loading + fetchpriority=high. Use for above-the-fold images. */
    priority?: boolean;
    /** "blur" shows a solid-colour placeholder until the image loads. "none" omits it. */
    placeholder?: 'blur' | 'none';
    /** Native <img> loading mode. Overrides the `priority`-derived default. */
    loading?: 'eager' | 'lazy';
    /** Native <img> decoding hint. Overrides the `priority`-derived default. */
    decoding?: 'sync' | 'async' | 'auto';
    /** Native <img> fetch priority. Overrides the `priority`-derived default. */
    fetchpriority?: 'high' | 'low' | 'auto';
    /** Native <img> CORS mode. */
    crossorigin?: 'anonymous' | 'use-credentials' | '';
    /** Native <img> referrer policy. */
    referrerpolicy?: string;
    /** Native <img> usemap — links the image to a <map>. */
    usemap?: string;
    /** Native <img> ismap — the image is part of a server-side image map. */
    ismap?: boolean;
}
declare function SeawompImage({ src, alt, srcset: srcsetProp, sizes, width, height, ratio, priority, placeholder, loading, decoding, fetchpriority, crossorigin, referrerpolicy, usemap, ismap, }: SeawompImageProps): import("wompo").RenderHtml;
export default SeawompImage;

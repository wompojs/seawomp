export interface GoogleFontLink {
    /** The matched `<link …>` tag, verbatim, for a targeted string replacement. */
    tag: string;
    /** The stylesheet href, HTML-entity-decoded (`&amp;` → `&`) so it can key the manifest map. */
    href: string;
}
/** Remove `<link rel="preconnect">` hints pointing at Google's font hosts. Once the stylesheet is
 * served locally these preconnects warm a connection that's never used. */
export declare function stripGoogleFontPreconnects(html: string): string;
/** Find every `<link rel="stylesheet" href="https://fonts.googleapis.com/css…">` in `html`. The
 * returned `href` is entity-decoded so it matches the (decoded) keys used by the build and the
 * manifest font map. */
export declare function findGoogleFontLinks(html: string): GoogleFontLink[];
/** The canonical replacement tag for a localized Google Fonts stylesheet. Emitted identically by
 * the build and the runtime so the SPA head diff keeps the live `<link>` in place across a
 * navigation between a prerendered page and an SSR-rendered one. */
export declare function localFontLinkTag(localHref: string): string;
/** Rewrite Google Fonts links in `html` to their localized equivalents using `map` (decoded
 * Google Fonts href → local `/_assets/fonts/…` href), also stripping the now-unneeded preconnect
 * hints. Pure and synchronous — no network, no filesystem — so it's safe on the SSR hot path.
 * Links whose href has no entry in `map` are left untouched, as are documents with no Google Fonts
 * link at all (fast path). */
export declare function localizeGoogleFontsWithMap(html: string, map: Record<string, string> | undefined): string;

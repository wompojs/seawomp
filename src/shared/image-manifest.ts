/* Build-time image manifest shared with <seawomp-image> during SSR.
 *
 * The production handler injects the manifest into the browser as `window.__SEAWOMP_IMAGES`;
 * this module is the server-side counterpart so the component can emit `srcset` directly in
 * the SSR HTML (first paint, crawlers and the LCP preload all see the optimized variants
 * instead of only picking them up after hydration).
 *
 * Why globalThis: same reason as i18n/context.ts — with `--preserve-symlinks` the component
 * module can be a different instance than the build/server module that sets the manifest, so
 * module-level state wouldn't be shared. SSG and the prod server set it once at startup.
 */

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

const KEY = '__seawompImageManifest__';

/** Register the build image manifest for SSR renders. Pass `null` to clear. */
export function setSsrImageManifest(manifest: SsrImageManifest | null): void {
	(globalThis as Record<string, unknown>)[KEY] = manifest ?? undefined;
}

export function getSsrImageManifest(): SsrImageManifest | null {
	const manifest = (globalThis as Record<string, unknown>)[KEY] as SsrImageManifest | undefined;
	return manifest ?? null;
}

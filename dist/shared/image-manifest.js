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
const KEY = '__seawompImageManifest__';
/** Register the build image manifest for SSR renders. Pass `null` to clear. */
export function setSsrImageManifest(manifest) {
    globalThis[KEY] = manifest ?? undefined;
}
export function getSsrImageManifest() {
    const manifest = globalThis[KEY];
    return manifest ?? null;
}

import type { RouteEntry } from '../server/routes.js';
import type { I18nConfig } from '../i18n/index.js';
import type { NavigationOptions } from '../config.js';
/** Convert an absolute file path to the dev URL the source-server exposes. */
export declare function srcUrl(abs: string): string;
interface HydrateEntryOptions {
    i18n?: I18nConfig;
    navigation?: NavigationOptions;
}
/** Build the hydrate-entry JS. Inlines the route table + the HMR client snippet. */
export declare function buildHydrateEntry(routes: RouteEntry[], opts?: HydrateEntryOptions): string;
export {};

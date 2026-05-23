import type { RouteEntry } from './routes.js';
export interface SsgOptions {
    routes: RouteEntry[];
    loadModule: (abs: string) => Promise<any>;
    outDir: string;
    origin?: string;
    hydrateScript?: string;
    title?: string;
    headExtra?: string;
    cwd?: string;
}
export interface SsgResult {
    written: string[];
    skipped: {
        pattern: string;
        reason: string;
    }[];
}
export declare function prerender(opts: SsgOptions): Promise<SsgResult>;

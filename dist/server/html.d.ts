export interface ShellOptions {
    title?: string;
    /** Tags injected into `<head>` (CSS, modulepreload, etc.). */
    headExtra?: string;
    /** ES module URL the client should load for hydration. */
    hydrateScript?: string;
    /** Optional language attribute. */
    lang?: string;
}
export declare function openShell(opts?: ShellOptions): string;
export declare function closeShell(hydrateScript?: string): string;

export interface ShellOptions {
    title?: string;
    /** Tags injected into `<head>` (CSS, modulepreload, etc.). */
    headExtra?: string;
    /** Per-page `<head>` fragment (from `pageMod.head(props)`), already tagged with
     * `data-seawomp-head`. Injected after `headExtra`; if it contains a `<title>` the default
     * shell title is suppressed so we don't emit two `<title>` tags. */
    pageHead?: string;
    /** ES module URL the client should load for hydration. */
    hydrateScript?: string;
    /** Optional language attribute. */
    lang?: string;
}
export declare function openShell(opts?: ShellOptions): string;
export declare function closeShell(hydrateScript?: string): string;

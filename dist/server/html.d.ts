export interface ShellOptions {
    title?: string;
    /** Framework-generated tags injected into `<head>` (discoverability, manifests, etc.). */
    frameworkHead?: string;
    /** Per-page `<head>` fragment (from `pageMod.head(props)`), already tagged with
     * `data-seawomp-head`. Injected after `frameworkHead`; if it contains a `<title>` the
     * default shell title is suppressed so we don't emit two `<title>` tags. */
    pageHead?: string;
    /** ES module URL the client should load for hydration. */
    hydrateScript?: string;
    /** Optional language attribute. */
    lang?: string;
    /** Marks a special-route render so the hydrate bootstrap loads the matching client chunk.
     * The URL alone can't identify an error render (its URL matches a normal route), so the
     * server annotates the document instead. Emitted as `data-seawomp-render` on `<html>`. */
    renderKind?: 'not-found' | 'error';
}
export declare function openShell(opts?: ShellOptions): string;
export declare function closeShell(hydrateScript?: string): string;

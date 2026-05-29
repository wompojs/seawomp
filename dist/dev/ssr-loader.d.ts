/** Invalidate every cached SSR bundle. Called by the dev file watcher on source changes. */
export declare function bumpSsrEpoch(): void;
/** Build a `loadModule` that re-bundles route modules per edit so SSR stays in sync with source. */
export declare function createDevLoadModule(cwd: string): (absPath: string) => Promise<unknown>;

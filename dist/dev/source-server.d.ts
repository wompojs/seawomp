export declare function invalidateSrc(abs?: string): void;
/** Serve /_src/<abs>: read, transpile, rewrite imports, cache. */
export declare function serveSrc(absPath: string, cwd: string): Promise<{
    code: string;
    type: string;
} | null>;
/** Serve /_dep/<spec>: bundle a node_modules entry. Cached forever (restart dev to refresh). */
export declare function serveDep(spec: string, cwd: string): Promise<{
    code: string;
    type: string;
} | null>;

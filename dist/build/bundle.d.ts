import type { ResolvedConfig } from '../config.js';
export interface BuildAllOptions {
    target?: 'bun' | 'vercel';
}
export declare function buildAll(cfg: ResolvedConfig, cwd: string, opts?: BuildAllOptions): Promise<void>;

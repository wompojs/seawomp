import type { ResolvedConfig } from '../config.js';
export declare function discoverabilityHeadTags(discoverability: ResolvedConfig['discoverability']): string;
export declare function writeDiscoverabilityFiles(staticDir: string, cfg: ResolvedConfig, paths: string[]): Promise<string[]>;

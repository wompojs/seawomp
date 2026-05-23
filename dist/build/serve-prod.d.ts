import type { ResolvedConfig } from '../config.js';
import type { BuildManifest } from '../server/manifest.js';
export type ProdFetchHandler = (request: Request) => Promise<Response>;
export declare function loadBuildManifest(cfg: ResolvedConfig): Promise<BuildManifest>;
export declare function createProdHandler(cfg: ResolvedConfig, cwd: string): Promise<ProdFetchHandler>;
export declare function startProd(cfg: ResolvedConfig, cwd: string): Promise<void>;

import { Hono } from 'hono';
import { type SeawompConfig } from '../config.js';
import { type ProdFetchHandler } from '../build/serve-prod.js';
export interface VercelAdapterOptions {
    cwd?: string;
    config?: SeawompConfig;
}
export declare function createVercelHandler(opts?: VercelAdapterOptions): Promise<ProdFetchHandler>;
export declare function createVercelApp(opts?: VercelAdapterOptions): Hono;
export default createVercelApp;

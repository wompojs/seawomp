export interface ServeStaticOptions {
    request?: Request;
    /** Dev keeps static files revalidated; prod applies framework cache defaults. */
    mode?: 'dev' | 'prod';
}
/** Try to serve `pathname` from `publicDir`. Returns null if not found or unsafe. */
export declare function serveStatic(publicDir: string, pathname: string, opts?: ServeStaticOptions): Promise<Response | null>;
export declare function compressResponseBody(data: Uint8Array, contentType: string | null, request: Request | undefined, headers: Headers): Uint8Array;

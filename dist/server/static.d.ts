/** Try to serve `pathname` from `publicDir`. Returns null if not found or unsafe. */
export declare function serveStatic(publicDir: string, pathname: string): Promise<Response | null>;

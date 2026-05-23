export interface ApiRouteEntry {
    /** URL pattern, e.g. `/api/users/:id`. */
    pattern: string;
    /** Absolute path of the `route.ts` module. */
    modulePath: string;
}
interface CompiledApi extends ApiRouteEntry {
    regex: RegExp;
    paramNames: string[];
}
/** Walk `appDir` and collect every `route.ts` file. The pattern is derived from the file path
 * exactly like page routes — `app/api/users/[id]/route.ts` → `/api/users/:id`. */
export declare function scanApiRoutes(appDir: string): ApiRouteEntry[];
export declare function compileApiRoutes(routes: ApiRouteEntry[]): CompiledApi[];
/** Try to dispatch a request against the API table. Returns null when no pattern matches —
 * caller then falls through to page routing. A matched pattern with an unsupported verb
 * returns 405 (NOT null). */
export declare function dispatchApi(request: Request, compiled: CompiledApi[], loadModule: (abs: string) => Promise<unknown>): Promise<Response | null>;
export {};

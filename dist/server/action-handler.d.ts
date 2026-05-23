export interface ActionDispatchOptions {
    /** Override the URL prefix matched against the request (default `/_action/`). */
    pathPrefix?: string;
}
/** Returns `true` if the URL pathname matches the action endpoint. */
export declare function isActionRequest(pathname: string, prefix?: string): boolean;
/** Handle an action invocation. Resolves to a Response. */
export declare function dispatchAction(request: Request, opts?: ActionDispatchOptions): Promise<Response>;

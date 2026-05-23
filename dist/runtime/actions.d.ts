export declare class ActionError extends Error {
    id: string;
    status: number;
    detail: string;
    constructor(id: string, status: number, detail: string);
}
export interface CallActionOptions {
    /** Override the URL prefix (default `/_action/`). Useful for mounting under a basepath. */
    pathPrefix?: string;
    /** Forwarded to fetch — pass an AbortSignal for cancellation. */
    signal?: AbortSignal;
}
export declare function callAction<R = unknown>(id: string, args?: unknown[], opts?: CallActionOptions): Promise<R>;

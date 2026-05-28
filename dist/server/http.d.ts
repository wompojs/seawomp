export type RedirectStatus = 301 | 302 | 303 | 307 | 308;
export declare class SeawompHttpSignal extends Error {
    status: number;
    location?: string;
    constructor(status: number, message: string, location?: string);
}
export declare function notFound(message?: string): SeawompHttpSignal;
export declare function redirect(destination: string, status?: RedirectStatus): SeawompHttpSignal;
export declare function isHttpSignal(value: unknown): value is SeawompHttpSignal;
export declare function isRedirectSignal(value: unknown): value is SeawompHttpSignal;
export declare function isNotFoundSignal(value: unknown): value is SeawompHttpSignal;
export declare function redirectResponse(signal: SeawompHttpSignal): Response;

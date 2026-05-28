import type { RenderHtml, WompoComponent } from 'wompo';
export interface LoaderArgs<P extends Record<string, string> = Record<string, string>> {
    params: P;
    request: Request;
    signal?: AbortSignal;
    url: URL;
}
export type Loader<T = unknown, P extends Record<string, string> = Record<string, string>> = (args: LoaderArgs<P>) => Promise<T> | T;
export interface PageProps<T = unknown, P extends Record<string, string> = Record<string, string>> {
    params: P;
    data: T;
    url: URL;
}
export interface LayoutProps {
    /** The child page rendered inside this layout. */
    children?: unknown;
    params?: Record<string, string>;
    data?: unknown;
    url?: URL;
}
export interface RouteMatch<P extends Record<string, string> = Record<string, string>> {
    pattern: string;
    params: P;
    /** Resolved file paths to import for layouts (outermost first) and the page. */
    layouts: string[];
    page: string;
    loader?: string;
    errorBoundary?: string;
}
export interface PageModule {
    default: WompoComponent;
    prerender?: boolean | string[];
    generateStaticPaths?: () => StaticPath[] | Promise<StaticPath[]>;
    head?: (props: PageProps) => RenderHtml | null | undefined;
}
export type StaticPath = string | {
    path?: string;
    params?: Record<string, string | number | Array<string | number>>;
};
export interface LayoutModule {
    default: WompoComponent;
    head?: (props: LayoutProps) => RenderHtml | null | undefined;
}
export interface LoaderModule {
    loader: Loader;
}
export interface ApiHandlerContext<P extends Record<string, string> = Record<string, string>> {
    request: Request;
    params: P;
    url: URL;
}
export type ApiHandler<P extends Record<string, string> = Record<string, string>> = (ctx: ApiHandlerContext<P>) => Response | Promise<Response>;
export interface ApiRouteModule {
    GET?: ApiHandler;
    POST?: ApiHandler;
    PUT?: ApiHandler;
    PATCH?: ApiHandler;
    DELETE?: ApiHandler;
    OPTIONS?: ApiHandler;
    HEAD?: ApiHandler;
}

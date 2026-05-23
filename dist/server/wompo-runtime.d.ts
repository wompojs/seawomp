export type WompoComponent = (...args: any[]) => any;
export interface WompoRuntime {
    attrs: (props: unknown) => unknown;
    defineWompo: (component: WompoComponent, opts: {
        name: string;
    }) => WompoComponent;
    html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
    renderToStream: (component: WompoComponent, props?: unknown) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
    ssr: any;
}
export declare function getWompoRuntime(cwd: string): Promise<WompoRuntime>;

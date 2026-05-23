import type { ServerWebSocket } from 'bun';
export declare function registerSocket(ws: ServerWebSocket<unknown>): void;
export declare function unregisterSocket(ws: ServerWebSocket<unknown>): void;
export declare function broadcastReload(): void;

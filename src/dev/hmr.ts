/* Dev HMR — v1 ships full page reload only.
 *
 * Opens a WebSocket per connected client. When the file watcher detects a change anywhere
 * under `appDir` / `globalCss`, every socket receives the string `'reload'` and the client
 * runtime calls `location.reload()`.
 *
 * No module-level swap is implemented — the cost/benefit didn't pencil out for v1. Full
 * reload is robust against custom-element registry state and avoids the partial-update
 * artefacts that bit similar setups in the past.
 */
import type { ServerWebSocket } from 'bun';

const sockets = new Set<ServerWebSocket<unknown>>();

export function registerSocket(ws: ServerWebSocket<unknown>): void {
  sockets.add(ws);
}

export function unregisterSocket(ws: ServerWebSocket<unknown>): void {
  sockets.delete(ws);
}

export function broadcastReload(): void {
  for (const ws of sockets) {
    try { ws.send('reload'); } catch { /* socket closed */ }
  }
}

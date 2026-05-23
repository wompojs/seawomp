const sockets = new Set();
export function registerSocket(ws) {
    sockets.add(ws);
}
export function unregisterSocket(ws) {
    sockets.delete(ws);
}
export function broadcastReload() {
    for (const ws of sockets) {
        try {
            ws.send('reload');
        }
        catch { /* socket closed */ }
    }
}

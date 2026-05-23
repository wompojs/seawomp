/* Static file server for `public/`.
 *
 * Used by the dev server (transient — files served straight from disk) and by `seawomp start`
 * (which can serve from the built `.seawomp/static/` tree). Detects MIME types from extension and
 * returns 404 when the path resolves outside `publicDir` (prevents `/../` traversal).
 */
import path from 'node:path';
import fs from 'node:fs/promises';

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8',
	'.map': 'application/json',
};

/** Try to serve `pathname` from `publicDir`. Returns null if not found or unsafe. */
export async function serveStatic(publicDir: string, pathname: string): Promise<Response | null> {
	// Decode + drop the leading slash, prevent `..` traversal.
	let rel = decodeURIComponent(pathname.replace(/^\/+/, ''));
	if (!rel || rel.endsWith('/')) rel += 'index.html';
	const abs = path.resolve(publicDir, rel);
	if (!abs.startsWith(publicDir)) return null;
	try {
		const data = await fs.readFile(abs);
		const ext = path.extname(abs).toLowerCase();
		const type = MIME[ext] ?? 'application/octet-stream';
		return new Response(data, { headers: { 'content-type': type, 'cache-control': 'no-cache' } });
	} catch {
		return null;
	}
}

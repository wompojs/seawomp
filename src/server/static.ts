/* Static file server for `public/`.
 *
 * Used by the dev server (transient — files served straight from disk) and by `seawomp start`
 * (which can serve from the built `.seawomp/static/` tree). Detects MIME types from extension and
 * returns 404 when the path resolves outside `publicDir` (prevents `/../` traversal).
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';

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

export interface ServeStaticOptions {
	request?: Request;
	/** Dev keeps static files revalidated; prod applies framework cache defaults. */
	mode?: 'dev' | 'prod';
}

/** Try to serve `pathname` from `publicDir`. Returns null if not found or unsafe. */
export async function serveStatic(
	publicDir: string,
	pathname: string,
	opts: ServeStaticOptions = {},
): Promise<Response | null> {
	// Decode + drop the leading slash, prevent `..` traversal.
	let rel = decodeURIComponent(pathname.replace(/^\/+/, ''));
	if (!rel || rel.endsWith('/')) rel += 'index.html';
	const abs = path.resolve(publicDir, rel);
	if (!isInside(publicDir, abs)) return null;
	try {
		const data = await fs.readFile(abs);
		const ext = path.extname(abs).toLowerCase();
		const type = MIME[ext] ?? 'application/octet-stream';
		const headers = new Headers({
			'content-type': type,
			'cache-control': cacheControlFor(pathname, rel, opts.mode ?? 'dev'),
		});
		const body = maybeCompressFile(data, abs, opts.request, headers);
		return new Response(body as BodyInit, { headers });
	} catch {
		return null;
	}
}

function isInside(root: string, filePath: string): boolean {
	const relative = path.relative(root, filePath);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function cacheControlFor(
	pathname: string,
	relativePath: string,
	mode: 'dev' | 'prod',
): string {
	if (mode === 'dev') return 'no-cache';
	const normalized = relativePath.split(path.sep).join('/');
	if (pathname.startsWith('/_assets/') || normalized.startsWith('_assets/')) {
		return 'public, max-age=31536000, immutable';
	}
	if (isShortLivedDocument(normalized)) return 'public, max-age=3600';
	return 'no-cache';
}

function isShortLivedDocument(relativePath: string): boolean {
	const base = path.posix.basename(relativePath);
	return (
		/\.(?:html|xml|txt)$/i.test(relativePath) ||
		base === 'manifest.json' ||
		base === 'site.webmanifest' ||
		base === 'robots.txt' ||
		base === 'llms.txt' ||
		base === 'sitemap.xml' ||
		base === 'sitemap.txt'
	);
}

function maybeCompressFile(
	data: Uint8Array,
	filePath: string,
	request: Request | undefined,
	headers: Headers,
): Uint8Array {
	if (!request || !isCompressible(filePath)) return data;
	return compressIfAccepted(data, request, headers);
}

export function compressResponseBody(
	data: Uint8Array,
	contentType: string | null,
	request: Request | undefined,
	headers: Headers,
): Uint8Array {
	if (!request || !isCompressibleContentType(contentType)) return data;
	return compressIfAccepted(data, request, headers);
}

function compressIfAccepted(
	data: Uint8Array,
	request: Request,
	headers: Headers,
): Uint8Array {
	const acceptEncoding = request.headers.get('accept-encoding') ?? '';
	if (/\bbr\b/.test(acceptEncoding)) {
		headers.set('content-encoding', 'br');
		headers.set('vary', 'Accept-Encoding');
		return brotliCompressSync(data, {
			params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
		});
	}
	if (/\bgzip\b/.test(acceptEncoding)) {
		headers.set('content-encoding', 'gzip');
		headers.set('vary', 'Accept-Encoding');
		return gzipSync(data);
	}
	return data;
}

function isCompressible(filePath: string): boolean {
	return /\.(?:html|css|js|mjs|json|txt|svg|xml|webmanifest)$/i.test(filePath);
}

function isCompressibleContentType(contentType: string | null): boolean {
	return Boolean(
		contentType &&
			/^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/i.test(contentType),
	);
}

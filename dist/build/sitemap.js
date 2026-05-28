import fs from 'node:fs/promises';
import path from 'node:path';
export async function writeSitemap(staticDir, siteUrl, paths) {
    if (!paths.length)
        return null;
    if (!siteUrl) {
        console.warn('[seawomp] siteUrl is not configured — skipping sitemap.xml generation');
        return null;
    }
    const origin = normalizeOrigin(siteUrl);
    const uniquePaths = [...new Set(paths)].sort();
    const urls = uniquePaths
        .map((pathname) => `  <url><loc>${escapeXml(origin + normalizePath(pathname))}</loc></url>`)
        .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    const out = path.join(staticDir, 'sitemap.xml');
    await fs.writeFile(out, xml, 'utf-8');
    return out;
}
function normalizeOrigin(siteUrl) {
    return siteUrl.replace(/\/+$/, '');
}
function normalizePath(pathname) {
    if (pathname === '/')
        return '/';
    return pathname.startsWith('/') ? pathname : '/' + pathname;
}
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

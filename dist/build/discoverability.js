import fs from 'node:fs/promises';
import path from 'node:path';
export function discoverabilityHeadTags(discoverability) {
    if (!discoverability.llmsLink || !discoverability.llmsTxt)
        return '';
    return '<link rel="alternate" type="text/plain" href="/llms.txt" title="LLMs text" />';
}
export async function writeDiscoverabilityFiles(staticDir, cfg, paths) {
    const written = [];
    const uniquePaths = [...new Set(paths)].sort();
    if (cfg.discoverability.sitemapTxt) {
        written.push(await writeTextSitemap(staticDir, cfg.siteUrl, uniquePaths));
    }
    if (cfg.discoverability.robotsTxt) {
        written.push(await writeRobotsTxt(staticDir, cfg.siteUrl, cfg.discoverability.robotsTxt, cfg.discoverability.sitemapTxt));
    }
    if (cfg.discoverability.llmsTxt) {
        written.push(await writeLlmsTxt(staticDir, cfg.siteUrl, cfg.title, cfg.discoverability.llmsTxt, uniquePaths));
    }
    return written;
}
async function writeTextSitemap(staticDir, siteUrl, paths) {
    const body = paths.map((pathname) => absoluteOrPath(siteUrl, pathname)).join('\n') + '\n';
    const out = path.join(staticDir, 'sitemap.txt');
    await fs.writeFile(out, body, 'utf-8');
    return out;
}
async function writeRobotsTxt(staticDir, siteUrl, options, includeTextSitemap) {
    const opts = typeof options === 'object' ? options : {};
    const lines = [
        `User-agent: ${opts.userAgent ?? '*'}`,
        ...(opts.allow?.length ? opts.allow.map((entry) => `Allow: ${normalizePath(entry)}`) : ['Allow: /']),
        ...(opts.disallow ?? []).map((entry) => `Disallow: ${normalizePath(entry)}`),
        ...(opts.extra ?? []),
    ];
    if ((opts.sitemap ?? true) && siteUrl) {
        lines.push('', `Sitemap: ${absoluteOrPath(siteUrl, '/sitemap.xml')}`);
        if (includeTextSitemap)
            lines.push(`Sitemap: ${absoluteOrPath(siteUrl, '/sitemap.txt')}`);
    }
    const out = path.join(staticDir, 'robots.txt');
    await fs.writeFile(out, lines.join('\n') + '\n', 'utf-8');
    return out;
}
async function writeLlmsTxt(staticDir, siteUrl, configTitle, options, paths) {
    const out = path.join(staticDir, 'llms.txt');
    if (typeof options === 'string') {
        await fs.writeFile(out, ensureTrailingNewline(options), 'utf-8');
        return out;
    }
    const opts = typeof options === 'object' ? options : {};
    const title = opts.title ?? configTitle ?? siteUrl ?? 'seawomp site';
    const sections = opts.sections ?? [
        {
            title: 'Pages',
            links: paths.map((pathname) => ({
                title: pathname === '/' ? 'Home' : pathname,
                href: pathname,
            })),
        },
    ];
    const chunks = [`# ${title}`];
    if (opts.description)
        chunks.push('', opts.description.trim());
    for (const section of sections) {
        chunks.push('', `## ${section.title}`);
        if (section.body)
            chunks.push('', section.body.trim());
        for (const link of section.links ?? []) {
            if (typeof link === 'string') {
                chunks.push(`- ${absoluteOrPath(siteUrl, link)}`);
                continue;
            }
            const description = link.description ? ` - ${link.description}` : '';
            chunks.push(`- [${link.title}](${absoluteOrPath(siteUrl, link.href)})${description}`);
        }
    }
    if (opts.body)
        chunks.push('', opts.body.trim());
    await fs.writeFile(out, ensureTrailingNewline(chunks.join('\n')), 'utf-8');
    return out;
}
function absoluteOrPath(siteUrl, pathnameOrUrl) {
    if (/^https?:\/\//i.test(pathnameOrUrl))
        return pathnameOrUrl;
    const pathname = normalizePath(pathnameOrUrl);
    if (!siteUrl)
        return pathname;
    return normalizeOrigin(siteUrl) + pathname;
}
function normalizeOrigin(siteUrl) {
    return siteUrl.replace(/\/+$/, '');
}
function normalizePath(pathname) {
    if (pathname === '/')
        return '/';
    return pathname.startsWith('/') ? pathname : '/' + pathname;
}
function ensureTrailingNewline(value) {
    return value.endsWith('\n') ? value : value + '\n';
}

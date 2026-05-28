import fs from 'node:fs/promises';
import path from 'node:path';
export function createFontBuildContext(outAssetsDir) {
    return {
        outAssetsDir,
        publicPrefix: '/_assets/fonts',
        cache: new Map(),
        written: 0,
    };
}
export async function localizeGoogleFontsInHtml(html, ctx) {
    let out = stripGoogleFontPreconnects(html);
    const links = findGoogleFontLinks(out);
    for (const link of links) {
        const localHref = await localizeGoogleFontHref(link.href, ctx);
        if (!localHref)
            continue;
        const localTag = `<link rel="stylesheet" href="${escapeAttr(localHref)}" data-seawomp-font="local">`;
        out = out.replace(link.tag, localTag);
    }
    return out;
}
function stripGoogleFontPreconnects(html) {
    return html.replace(/<link\b(?=[^>]*rel=["']?preconnect["']?)(?=[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com["'])[^>]*>/gi, '');
}
function findGoogleFontLinks(html) {
    const out = [];
    const re = /<link\b(?=[^>]*rel=["']?stylesheet["']?)[^>]*>/gi;
    let match;
    while ((match = re.exec(html))) {
        const href = attrValue(match[0], 'href');
        if (!href)
            continue;
        const decoded = href.replace(/&amp;/g, '&');
        if (/^https:\/\/fonts\.googleapis\.com\/css2?\?/i.test(decoded)) {
            out.push({ tag: match[0], href: decoded });
        }
    }
    return out;
}
async function localizeGoogleFontHref(href, ctx) {
    let cached = ctx.cache.get(href);
    if (!cached) {
        cached = downloadAndWriteFontCss(href, ctx);
        ctx.cache.set(href, cached);
    }
    return cached;
}
async function downloadAndWriteFontCss(href, ctx) {
    try {
        const cssRes = await fetch(href, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            },
        });
        if (!cssRes.ok)
            throw new Error(`CSS request failed with ${cssRes.status}`);
        let css = await cssRes.text();
        const fontUrls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
        await fs.mkdir(path.join(ctx.outAssetsDir, 'fonts'), { recursive: true });
        for (const fontUrl of fontUrls) {
            const localUrl = await downloadFontFile(fontUrl, ctx);
            if (localUrl)
                css = css.replaceAll(fontUrl, localUrl);
        }
        const cssHash = Bun.hash(css).toString(16).slice(0, 10);
        const cssName = `google-fonts-${cssHash}.css`;
        await fs.writeFile(path.join(ctx.outAssetsDir, 'fonts', cssName), css, 'utf-8');
        ctx.written++;
        return `${ctx.publicPrefix}/${cssName}`;
    }
    catch (err) {
        console.warn(`[seawomp] could not localize Google Font ${href}: ${err.message}`);
        return null;
    }
}
async function downloadFontFile(fontUrl, ctx) {
    try {
        const res = await fetch(fontUrl);
        if (!res.ok)
            throw new Error(`font request failed with ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        const ext = extensionFromUrl(fontUrl) || '.woff2';
        const hash = Bun.hash(bytes).toString(16).slice(0, 10);
        const basename = path.basename(new URL(fontUrl).pathname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${basename}-${hash}${ext}`;
        await fs.writeFile(path.join(ctx.outAssetsDir, 'fonts', fileName), bytes);
        ctx.written++;
        return `${ctx.publicPrefix}/${fileName}`;
    }
    catch (err) {
        console.warn(`[seawomp] could not download Google Font asset ${fontUrl}: ${err.message}`);
        return null;
    }
}
function extensionFromUrl(url) {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    return ext || '.woff2';
}
function attrValue(tag, name) {
    const quoted = new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, 'i').exec(tag);
    if (quoted)
        return quoted[2];
    const bare = new RegExp(`\\s${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
    return bare ? bare[1] : null;
}
function escapeAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* Build-time image pipeline.
 *
 * Walks `publicDir/**`, finds raster images (.jpg/.jpeg/.png/.webp), and emits resized variants
 * in the formats listed in `cfg.images.formats` (default AVIF + WebP). The manifest maps each
 * original `/images/foo.jpg` URL to the list of variants — `<seawomp-image>` reads it at runtime
 * (via `window.__SEAWOMP_IMAGES`, injected into `<head>`) and builds srcset automatically.
 *
 * `sharp` is a peer-optional dep: if it's not installed, we copy the originals verbatim and
 * log a warning. SVGs are always copied unchanged.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
const RASTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIME = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
};
async function tryLoadSharp() {
    try {
        // @ts-ignore - sharp is a peer-optional dependency
        const mod = await import('sharp');
        return mod.default ?? mod;
    }
    catch {
        return null;
    }
}
async function walk(dir) {
    const out = [];
    async function rec(d) {
        let entries;
        try {
            entries = await fs.readdir(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const ent of entries) {
            const abs = path.join(d, ent.name);
            if (ent.isDirectory())
                await rec(abs);
            else
                out.push(abs);
        }
    }
    await rec(dir);
    return out;
}
/** Returns the manifest and the count of variants written. */
export async function buildImages(opts) {
    const manifest = {};
    if (opts.images.disabled)
        return { manifest, written: 0 };
    const files = await walk(opts.publicDir);
    if (!files.length)
        return { manifest, written: 0 };
    const imgOut = path.join(opts.outAssetsDir, 'img');
    await fs.mkdir(imgOut, { recursive: true });
    const sharp = await tryLoadSharp();
    if (!sharp) {
        console.warn('[seawomp] `sharp` not installed — skipping image optimization (originals will be served as-is).');
    }
    let written = 0;
    for (const abs of files) {
        const ext = path.extname(abs).toLowerCase();
        const rel = '/' + path.relative(opts.publicDir, abs).split(path.sep).join('/');
        if (!RASTER_EXTS.has(ext))
            continue;
        if (!sharp) {
            // No sharp — leave the URL pointing at the original.
            continue;
        }
        const variants = [];
        let buf;
        try {
            buf = await fs.readFile(abs);
        }
        catch (err) {
            console.warn(`[seawomp] could not read ${abs}: ${err.message}`);
            continue;
        }
        let metadata;
        try {
            metadata = await sharp(buf).metadata();
        }
        catch (err) {
            console.warn(`[seawomp] sharp metadata failed for ${rel}: ${err.message}`);
            continue;
        }
        const intrinsicWidth = metadata.width ?? 0;
        if (!intrinsicWidth)
            continue;
        // Always emit the original-size variant in each requested format (fallback). Then emit
        // smaller variants that don't exceed the source size — upscaling is wasteful.
        const targetWidths = [
            ...new Set([intrinsicWidth, ...opts.images.sizes.filter((w) => w < intrinsicWidth)]),
        ].sort((a, b) => a - b);
        const formats = [...opts.images.formats, 'original'];
        for (const fmt of formats) {
            for (const w of targetWidths) {
                const outExt = fmt === 'original' ? ext : '.' + fmt;
                const stem = path.basename(abs, ext);
                const outName = `${stem}-${w}${outExt}`;
                const outAbs = path.join(imgOut, outName);
                try {
                    let pipeline = sharp(buf).resize({ width: w, withoutEnlargement: true });
                    if (fmt === 'webp')
                        pipeline = pipeline.webp({ quality: 80 });
                    else if (fmt === 'avif')
                        pipeline = pipeline.avif({ quality: 60 });
                    await pipeline.toFile(outAbs);
                    written++;
                    variants.push({
                        src: `${opts.publicPrefix}/${outName}`,
                        type: MIME[outExt] ?? 'application/octet-stream',
                        width: w,
                    });
                }
                catch (err) {
                    console.warn(`[seawomp] sharp encode failed (${rel} → ${fmt}@${w}): ${err.message}`);
                }
            }
        }
        if (variants.length)
            manifest[rel] = variants;
    }
    return { manifest, written };
}

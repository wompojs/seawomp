/* CSS minification powered by lightningcss. Used only for the global CSS file — wompo's
 * per-component CSS lives in shadow-DOM scopes and is not extracted. */
import { transform } from 'lightningcss';
export function minifyCss(code, filename) {
    try {
        const { code: out } = transform({
            filename,
            code: Buffer.from(code),
            minify: true,
            targets: { chrome: 90 << 16, firefox: 90 << 16, safari: 14 << 16 },
        });
        return out.toString();
    }
    catch (err) {
        console.warn(`[seawomp] CSS minify failed for ${filename}: ${err.message}`);
        return code;
    }
}

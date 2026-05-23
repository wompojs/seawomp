/* <seawomp-image> — built-in optimized image component.
 *
 * SSR: emits the tag inalterato (browsers tolerate unknown elements; SEO sees `<seawomp-image>`
 * with the user-provided children).
 *
 * Client: on connect, builds a `<span class="seawomp-image__wrap">` wrapper + a solid placeholder
 * + the real `<img>`. Lazy loading + async decoding by default; `priority` flips to eager +
 * fetchpriority=high for above-the-fold imagery. When the build pipeline generated variants,
 * the global `window.__SEAWOMP_IMAGES` map (injected by the prod handler into `<head>`) supplies
 * the srcset automatically.
 *
 * Attributes:
 *   src         — required
 *   alt         — required for a11y
 *   srcset      — passes through; auto-populated from __SEAWOMP_IMAGES when present
 *   sizes       — passes through
 *   width/height — used to reserve aspect-ratio space
 *   ratio       — CSS aspect-ratio fallback (e.g. "4/3") when width/height not provided
 *   priority    — boolean; eager + fetchpriority=high + decoding=sync
 *   placeholder — "blur" | "none"; default "blur"
 *
 * Styling lives in the app's global CSS (the framework ships no CSS):
 *   .seawomp-image__wrap { position: relative; display: block; overflow: hidden; }
 *   .seawomp-image__placeholder { position: absolute; inset: 0; background: var(--placeholder,#e5e5e5); transition: opacity 240ms; }
 *   .seawomp-image__wrap img { width: 100%; height: 100%; object-fit: cover; }
 *   .seawomp-image--loaded .seawomp-image__placeholder { opacity: 0; }
 */
if (typeof HTMLElement !== 'undefined') {
    class SeawompImage extends HTMLElement {
        static observedAttributes = ['src', 'srcset', 'sizes', 'alt'];
        connectedCallback() {
            if (this.querySelector('img'))
                return; // already enhanced (HMR / SPA nav)
            const src = this.getAttribute('src');
            const alt = this.getAttribute('alt') ?? '';
            let srcset = this.getAttribute('srcset') ?? '';
            const sizes = this.getAttribute('sizes') ?? '';
            const width = this.getAttribute('width');
            const height = this.getAttribute('height');
            const ratio = this.getAttribute('ratio');
            const priority = this.hasAttribute('priority');
            const placeholder = (this.getAttribute('placeholder') ?? 'blur');
            if (!alt && typeof console !== 'undefined') {
                console.warn('[seawomp-image] missing `alt` attribute on', src);
            }
            // Build-time variants override an empty srcset (the user can still hand-pin srcset to skip).
            if (!srcset && src && typeof window !== 'undefined' && window.__SEAWOMP_IMAGES?.[src]) {
                srcset = window.__SEAWOMP_IMAGES[src].map((v) => `${v.src} ${v.width}w`).join(', ');
            }
            const wrapper = document.createElement('span');
            wrapper.className = 'seawomp-image__wrap';
            if (ratio)
                wrapper.style.aspectRatio = ratio;
            else if (width && height)
                wrapper.style.aspectRatio = `${width} / ${height}`;
            if (placeholder !== 'none') {
                const ph = document.createElement('span');
                ph.className = 'seawomp-image__placeholder';
                wrapper.appendChild(ph);
            }
            const img = document.createElement('img');
            img.alt = alt;
            img.decoding = priority ? 'sync' : 'async';
            img.loading = priority ? 'eager' : 'lazy';
            if (priority)
                img.setAttribute('fetchpriority', 'high');
            if (srcset)
                img.srcset = srcset;
            if (sizes)
                img.sizes = sizes;
            if (width)
                img.width = Number(width);
            if (height)
                img.height = Number(height);
            img.addEventListener('load', () => wrapper.classList.add('seawomp-image--loaded'));
            if (src)
                img.src = src;
            wrapper.appendChild(img);
            this.appendChild(wrapper);
        }
    }
    if (typeof customElements !== 'undefined' && !customElements.get('seawomp-image')) {
        customElements.define('seawomp-image', SeawompImage);
    }
}
export {};

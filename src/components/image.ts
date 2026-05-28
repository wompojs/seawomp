/* <seawomp-image> — built-in optimised image component, implemented as a Wompo component.
 *
 * SSR: renders a full `<span.seawomp-image__wrap> > <img>` tree server-side so crawlers see
 * the real markup and no layout shift occurs.
 *
 * Client: hydrates as a Wompo custom element. Tracks the `load` event via state; also checks
 * `img.complete` on mount so images served from the browser cache are never stuck showing the
 * placeholder.
 *
 * Build-time variant manifest: when `window.__SEAWOMP_IMAGES` is populated by the production
 * handler (injected into `<head>`), the component builds a `srcset` automatically from the
 * list of resized / reformatted variants the build pipeline generated.
 *
 * Attributes / Props:
 *   src         — required
 *   alt         — required for a11y (warns when absent)
 *   srcset      — passes through; auto-populated from __SEAWOMP_IMAGES when not provided
 *   sizes       — passes through
 *   width/height — used to reserve aspect-ratio space
 *   ratio       — CSS aspect-ratio override (e.g. "4/3") when width/height are not provided
 *   priority    — boolean; eager loading + fetchpriority=high + decoding=sync
 *   placeholder — "blur" | "none"; default "blur"
 *
 * Required global CSS (ship your own, the framework emits none):
 *   .seawomp-image__wrap { position: relative; display: block; overflow: hidden; }
 *   .seawomp-image__placeholder { position: absolute; inset: 0; background: var(--placeholder, #e5e5e5); transition: opacity 240ms; }
 *   .seawomp-image__wrap img { width: 100%; height: 100%; object-fit: cover; }
 *   .seawomp-image--loaded .seawomp-image__placeholder { opacity: 0; }
 */
import {
	defineWompo,
	html,
	useState,
	useEffect,
	useRef,
	type WompoProps,
} from 'wompo';

declare global {
	interface Window {
		/** Build manifest: maps original src → list of `[src, type, width]` triplets. */
		__SEAWOMP_IMAGES?: Record<string, { src: string; type: string; width: number }[]>;
	}
}

export interface SeawompImageProps extends WompoProps {
	src?: string;
	alt?: string;
	srcset?: string;
	sizes?: string;
	width?: number | string;
	height?: number | string;
	/** CSS aspect-ratio value (e.g. "16/9"). Overrides width/height for ratio reservation. */
	ratio?: string;
	/** Eager loading + fetchpriority=high. Use for above-the-fold images. */
	priority?: boolean;
	/** "blur" shows a solid-colour placeholder until the image loads. "none" omits it. */
	placeholder?: 'blur' | 'none';
}

function SeawompImage({
	src = '',
	alt = '',
	srcset: srcsetProp = '',
	sizes = '',
	width,
	height,
	ratio,
	priority = false,
	placeholder = 'blur',
}: SeawompImageProps) {
	const [loaded, setLoaded] = useState(false);
	const imgRef = useRef<HTMLImageElement | null>(null);

	if (!alt && src && typeof console !== 'undefined') {
		console.warn('[seawomp-image] missing `alt` attribute on', src);
	}

	// Auto-populate srcset from the build-time manifest when not explicitly provided.
	let srcset = srcsetProp;
	if (!srcset && src && typeof window !== 'undefined' && window.__SEAWOMP_IMAGES?.[src]) {
		srcset = window.__SEAWOMP_IMAGES[src].map((v) => `${v.src} ${v.width}w`).join(', ');
	}

	// After client mount: if the image was already in the cache the `load` event never fires.
	useEffect(() => {
		if (imgRef.current?.complete) setLoaded(true);
	}, []);

	const aspectRatio = ratio ?? (width && height ? `${width} / ${height}` : undefined);
	const wrapClass = `seawomp-image__wrap${loaded ? ' seawomp-image--loaded' : ''}`;

	return html`
		<span
			class="${wrapClass}"
			style="${aspectRatio ? `aspect-ratio: ${aspectRatio}` : undefined}"
		>
			${placeholder !== 'none' ? html`<span class="seawomp-image__placeholder"></span>` : null}
			<img
				ref="${imgRef}"
				src="${src || undefined}"
				alt="${alt}"
				decoding="${priority ? 'sync' : 'async'}"
				loading="${priority ? 'eager' : 'lazy'}"
				fetchpriority="${priority ? 'high' : undefined}"
				srcset="${srcset || undefined}"
				sizes="${sizes || undefined}"
				width="${width}"
				height="${height}"
				@load="${() => setLoaded(true)}"
			/>
		</span>
	`;
}

defineWompo(SeawompImage, { name: 'seawomp-image' });
export default SeawompImage;

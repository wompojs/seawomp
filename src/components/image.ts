/* <seawomp-image> — built-in optimised image component, implemented as a Wompo component.
 *
 * SSR: used as an interpolated component (`<${Image} …>`), renders a full
 * `<span.seawomp-image__wrap> > <img>` tree server-side so crawlers see the real markup and
 * no layout shift occurs. When the build image manifest is registered (SSG and `seawomp
 * start` do this automatically), `srcset` is emitted directly in the SSR HTML — first paint
 * and the LCP preload use the optimized variants without waiting for hydration. A literal
 * `<seawomp-image>` tag is instead emitted as-is and builds its DOM on connect.
 *
 * Client: hydrates as a Wompo custom element. Tracks the `load` event via state; also checks
 * `img.complete` on mount so images served from the browser cache are never stuck showing the
 * placeholder.
 *
 * Build-time variant manifest: `window.__SEAWOMP_IMAGES` (client, injected into `<head>` by
 * the production handler) and `getSsrImageManifest()` (server) expose the resized /
 * reformatted variants the build pipeline generated; the component builds a `srcset`
 * automatically from them.
 *
 * Attributes / Props:
 *   src            — required
 *   alt            — required for a11y (warns when absent)
 *   srcset         — passes through; auto-populated from the build manifest when not provided
 *   sizes          — passes through
 *   width/height   — used to reserve aspect-ratio space
 *   ratio          — CSS aspect-ratio override (e.g. "4/3") when width/height are not provided
 *   priority       — boolean; eager loading + fetchpriority=high + decoding=sync
 *   placeholder    — "blur" | "none"; default "blur"
 *   loading        — "eager" | "lazy"; overrides the `priority` default
 *   decoding       — "sync" | "async" | "auto"; overrides the `priority` default
 *   fetchpriority  — "high" | "low" | "auto"; overrides the `priority` default
 *   crossorigin    — passes through to the inner <img>
 *   referrerpolicy — passes through to the inner <img>
 *   usemap         — passes through to the inner <img>
 *   ismap          — boolean; passes through to the inner <img>
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
import { getSsrImageManifest } from '../shared/image-manifest.js';

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
	/** Native <img> loading mode. Overrides the `priority`-derived default. */
	loading?: 'eager' | 'lazy';
	/** Native <img> decoding hint. Overrides the `priority`-derived default. */
	decoding?: 'sync' | 'async' | 'auto';
	/** Native <img> fetch priority. Overrides the `priority`-derived default. */
	fetchpriority?: 'high' | 'low' | 'auto';
	/** Native <img> CORS mode. */
	crossorigin?: 'anonymous' | 'use-credentials' | '';
	/** Native <img> referrer policy. */
	referrerpolicy?: string;
	/** Native <img> usemap — links the image to a <map>. */
	usemap?: string;
	/** Native <img> ismap — the image is part of a server-side image map. */
	ismap?: boolean;
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
	loading,
	decoding,
	fetchpriority,
	crossorigin,
	referrerpolicy,
	usemap,
	ismap = false,
}: SeawompImageProps) {
	const [loaded, setLoaded] = useState(false);
	const imgRef = useRef<HTMLImageElement | null>(null);

	if (!alt && src && typeof console !== 'undefined') {
		console.warn('[seawomp-image] missing `alt` attribute on', src);
	}

	// Auto-populate srcset from the build-time manifest when not explicitly provided.
	// Server-side the manifest is registered by SSG / the prod handler; client-side it's
	// injected into <head> as window.__SEAWOMP_IMAGES. Both hold the same data, so the SSR
	// markup and the hydrated render agree.
	let srcset = srcsetProp;
	if (!srcset && src) {
		const manifest =
			typeof window === 'undefined' ? getSsrImageManifest() : window.__SEAWOMP_IMAGES;
		const variants = manifest?.[src];
		if (variants?.length) {
			srcset = variants.map((v) => `${v.src} ${v.width}w`).join(', ');
		}
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
				decoding="${decoding ?? (priority ? 'sync' : 'async')}"
				loading="${loading ?? (priority ? 'eager' : 'lazy')}"
				fetchpriority="${fetchpriority ?? (priority ? 'high' : undefined)}"
				crossorigin="${crossorigin}"
				referrerpolicy="${referrerpolicy || undefined}"
				usemap="${usemap || undefined}"
				ismap="${ismap || undefined}"
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

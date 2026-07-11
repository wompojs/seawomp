/* <seawomp-image> Wompo component — smoke + SSR rendering tests.
 *
 * Verifies that the module can be imported in browser-less (SSR) environments, that the
 * exported component is a valid Wompo component, that the build image manifest yields a
 * server-rendered `srcset`, and that native <img> attributes pass through. Full DOM
 * behaviour is covered by the Playwright e2e spec.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { setSsrImageManifest } from '../../src/shared/image-manifest.js';

async function renderImage(props: Record<string, unknown>): Promise<string> {
	const [{ default: SeawompImage }, ssr] = await Promise.all([
		import('../../src/components/image.js'),
		import('wompo/ssr'),
	]);
	const rendered = await (ssr as any).renderToString(SeawompImage, props, {
		hydration: 'none',
		css: 'none',
	});
	return String(rendered.html ?? '');
}

describe('<seawomp-image> module', () => {
	it('imports without throwing in a non-DOM environment', async () => {
		const mod = await import('../../src/components/image.js');
		expect(mod).toBeDefined();
	});

	it('exports a default Wompo component function', async () => {
		const mod = await import('../../src/components/image.js');
		expect(typeof mod.default).toBe('function');
		// defineWompo sets _$wompoF on the function.
		expect((mod.default as any)._$wompoF).toBe(true);
	});

	it('exports a componentName of "seawomp-image"', async () => {
		const mod = await import('../../src/components/image.js');
		expect((mod.default as any).componentName).toBe('seawomp-image');
	});
});

describe('<seawomp-image> SSR srcset', () => {
	afterEach(() => setSsrImageManifest(null));

	it('emits srcset in the server-rendered markup when the manifest is registered', async () => {
		setSsrImageManifest({
			'/images/hero.png': [
				{ src: '/_assets/img/hero-640.avif', type: 'image/avif', width: 640 },
				{ src: '/_assets/img/hero-1280.avif', type: 'image/avif', width: 1280 },
			],
		});
		const html = await renderImage({ src: '/images/hero.png', alt: 'hero' });
		expect(html).toContain('srcset="/_assets/img/hero-640.avif 640w, /_assets/img/hero-1280.avif 1280w"');
	});

	it('omits srcset when the manifest has no entry for the src', async () => {
		setSsrImageManifest({});
		const html = await renderImage({ src: '/images/other.png', alt: 'other' });
		expect(html).not.toContain('srcset');
	});

	it('never overrides an explicit srcset prop', async () => {
		setSsrImageManifest({
			'/images/hero.png': [
				{ src: '/_assets/img/hero-640.avif', type: 'image/avif', width: 640 },
			],
		});
		const html = await renderImage({
			src: '/images/hero.png',
			alt: 'hero',
			srcset: '/custom-800.webp 800w',
		});
		expect(html).toContain('srcset="/custom-800.webp 800w"');
		expect(html).not.toContain('hero-640');
	});
});

describe('<seawomp-image> native <img> attributes', () => {
	it('applies the priority-derived defaults', async () => {
		const html = await renderImage({ src: '/a.png', alt: 'a', priority: true });
		expect(html).toContain('loading="eager"');
		expect(html).toContain('decoding="sync"');
		expect(html).toContain('fetchpriority="high"');
	});

	it('lets explicit attributes override the priority defaults', async () => {
		const html = await renderImage({
			src: '/a.png',
			alt: 'a',
			priority: true,
			loading: 'lazy',
			decoding: 'auto',
			fetchpriority: 'low',
		});
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('decoding="auto"');
		expect(html).toContain('fetchpriority="low"');
	});

	it('passes through crossorigin, referrerpolicy, usemap and ismap', async () => {
		const html = await renderImage({
			src: '/a.png',
			alt: 'a',
			crossorigin: 'anonymous',
			referrerpolicy: 'no-referrer',
			usemap: '#map',
			ismap: true,
		});
		expect(html).toContain('crossorigin="anonymous"');
		expect(html).toContain('referrerpolicy="no-referrer"');
		expect(html).toContain('usemap="#map"');
		expect(html).toContain('ismap');
	});
});

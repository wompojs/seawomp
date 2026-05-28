/* <seawomp-image> Wompo component — smoke tests.
 *
 * Verifies that the module can be imported in both browser-less (SSR) environments and that
 * the exported component is a valid Wompo component. Full DOM behaviour is covered by the
 * Playwright e2e spec.
 */
import { describe, expect, it } from 'bun:test';

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

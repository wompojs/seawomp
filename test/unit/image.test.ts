/* <seawomp-image> custom element — registration smoke test.
 *
 * Bun's test runner doesn't ship a DOM. Rather than depending on a heavy DOM library to assert
 * the connectedCallback enhancements (which are mechanically straightforward), we just verify
 * the module imports without throwing in a Node-like (no HTMLElement) environment, and exposes
 * the `__SEAWOMP_IMAGES` global typing.
 *
 * The full DOM behavior is exercised end-to-end by `seawomp-test` and the Playwright spec.
 */
import { describe, expect, it } from 'bun:test';

describe('<seawomp-image> module', () => {
	it('imports without throwing in a non-DOM environment', async () => {
		// Make sure HTMLElement is undefined so the file's DOM guard kicks in (matches SSR).
		expect((globalThis as any).HTMLElement).toBeUndefined();
		const mod = await import('../../src/components/image.js');
		expect(mod).toBeDefined();
	});
});

import { describe, expect, it } from 'bun:test';

describe('<seawomp-link> module', () => {
	it('imports without throwing in a non-DOM environment', async () => {
		const mod = await import('../../src/components/link.js');
		expect(mod).toBeDefined();
	});

	it('exports a default Wompo component function', async () => {
		const mod = await import('../../src/components/link.js');
		expect(typeof mod.default).toBe('function');
		expect((mod.default as any)._$wompoF).toBe(true);
	});

	it('exports a componentName of "seawomp-link"', async () => {
		const mod = await import('../../src/components/link.js');
		expect((mod.default as any).componentName).toBe('seawomp-link');
	});
});

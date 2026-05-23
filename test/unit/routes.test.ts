/* Unit tests for the file-based route scanner. */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRoutes } from '../../src/server/routes.js';

let tmpRoot: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seawomp-routes-'));
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(rel: string, content: string = '') {
	const abs = path.join(tmpRoot, rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content);
}

describe('scanRoutes', () => {
	it('returns [] for a non-existent directory', () => {
		const routes = scanRoutes(path.join(tmpRoot, 'missing'));
		expect(routes).toEqual([]);
	});

	it('discovers a single root page', () => {
		write('page.ts');
		const routes = scanRoutes(tmpRoot);
		expect(routes).toHaveLength(1);
		expect(routes[0].pattern).toBe('/');
	});

	it('handles dynamic segments and catch-all', () => {
		write('blog/page.ts');
		write('blog/[id]/page.ts');
		write('docs/[...slug]/page.ts');
		const routes = scanRoutes(tmpRoot);
		const patterns = routes.map((r) => r.pattern).sort();
		expect(patterns).toContain('/blog');
		expect(patterns).toContain('/blog/:id');
		expect(patterns).toContain('/docs/:slug*');
	});

	it('inherits layouts from ancestor directories', () => {
		write('layout.ts');
		write('blog/layout.ts');
		write('blog/[id]/page.ts');
		const routes = scanRoutes(tmpRoot);
		const blog = routes.find((r) => r.pattern === '/blog/:id')!;
		expect(blog.layoutPaths.map((p) => path.basename(path.dirname(p)))).toEqual([
			path.basename(tmpRoot),
			'blog',
		]);
	});

	it('inherits the nearest error boundary', () => {
		write('error.ts');
		write('blog/error.ts');
		write('blog/[id]/page.ts');
		write('about/page.ts');
		const routes = scanRoutes(tmpRoot);
		const blog = routes.find((r) => r.pattern === '/blog/:id')!;
		expect(path.basename(path.dirname(blog.errorPath!))).toBe('blog');
		const about = routes.find((r) => r.pattern === '/about')!;
		expect(path.basename(path.dirname(about.errorPath!))).toBe(path.basename(tmpRoot));
	});

	it('attaches an adjacent loader.ts', () => {
		write('blog/page.ts');
		write('blog/loader.ts');
		const routes = scanRoutes(tmpRoot);
		expect(routes[0].loaderPath).toBeTruthy();
		expect(path.basename(routes[0].loaderPath!)).toBe('loader.ts');
	});

	it('orders static routes before dynamic ones', () => {
		write('blog/new/page.ts');
		write('blog/[id]/page.ts');
		const routes = scanRoutes(tmpRoot);
		const newIdx = routes.findIndex((r) => r.pattern === '/blog/new');
		const dynIdx = routes.findIndex((r) => r.pattern === '/blog/:id');
		expect(newIdx).toBeLessThan(dynIdx);
	});
});

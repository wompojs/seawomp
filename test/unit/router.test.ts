import { afterEach, describe, expect, it } from 'bun:test';
import {
	currentLayoutsFor,
	setSpecialRoutes,
	type RouteRecord,
	type SpecialRouteRecords,
} from '../../src/runtime/router.js';

const NO_SPECIAL: SpecialRouteRecords = { notFound: null, error: null };

afterEach(() => {
	// Reset the module-global special table so tests don't leak into one another.
	setSpecialRoutes(NO_SPECIAL);
});

describe('currentLayoutsFor — swap-mode layout resolution', () => {
	const normalRoute: RouteRecord = {
		pattern: '/blog/:id',
		page: '/_assets/blog-page.js',
		layouts: ['/_assets/root-layout.js', '/_assets/blog-layout.js'],
	};

	it('returns the current route layouts when navigating from a normal route', () => {
		setSpecialRoutes({ notFound: { page: '/_assets/nf.js', layouts: ['/_assets/root-layout.js'] }, error: null });
		// A normal route record always wins over the special fallback, regardless of any marker.
		expect(currentLayoutsFor(normalRoute, 'not-found')).toEqual(normalRoute.layouts);
	});

	it('falls back to the 404 special-route layouts when leaving a not-found document', () => {
		const notFound = { page: '/_assets/nf.js', layouts: ['/_assets/root-layout.js'] };
		setSpecialRoutes({ notFound, error: null });
		// This is the double-transition fix: a 404 origin (no route record) resolves its layout
		// chain via the render marker, enabling the same-shell route-view swap.
		expect(currentLayoutsFor(null, 'not-found')).toEqual(notFound.layouts);
	});

	it('falls back to the error special-route layouts when leaving an error document', () => {
		const error = { page: '/_assets/err.js', layouts: ['/_assets/root-layout.js'] };
		setSpecialRoutes({ notFound: null, error });
		expect(currentLayoutsFor(null, 'error')).toEqual(error.layouts);
	});

	it('returns null when there is no route record and no render marker', () => {
		setSpecialRoutes({ notFound: { page: '/_assets/nf.js', layouts: ['/_assets/root-layout.js'] }, error: null });
		expect(currentLayoutsFor(null, null)).toBeNull();
		expect(currentLayoutsFor(null, undefined)).toBeNull();
	});

	it('returns null when the matching special route is not registered', () => {
		setSpecialRoutes({ notFound: null, error: null });
		// Marker present but no record → cannot resolve → caller does a full-body swap.
		expect(currentLayoutsFor(null, 'not-found')).toBeNull();
	});

	it('returns null when special routes were never registered', () => {
		setSpecialRoutes(NO_SPECIAL);
		expect(currentLayoutsFor(null, 'not-found')).toBeNull();
	});
});

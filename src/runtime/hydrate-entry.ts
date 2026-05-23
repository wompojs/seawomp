/* Hydration entry — loaded as a `<script type="module">` from the document shell.
 *
 * Each island in the SSR'd DOM carries `data-wompo-island` + a `<template data-wompo-props>` with
 * its initial props. We let `wompo/hydrate` schedule per the `client:load/idle/visible` mode;
 * for islands whose component class isn't yet defined, we look up `__SEAWOMP_ISLANDS[tag]` (set by
 * the build manifest) and dynamic-import the corresponding chunk before re-running hydrate.
 */
import { hydrate } from 'wompo/hydrate';

declare global {
	interface Window {
		__SEAWOMP_ISLANDS?: Record<string, string>;
	}
}

(async () => {
	// Run the hydrate scheduler. Islands whose component classes are already registered are
	// hydrated immediately; the rest log a warning and rely on the framework's manifest path.
	hydrate(document);
})();

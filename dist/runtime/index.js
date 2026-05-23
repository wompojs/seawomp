/* Public client runtime entry. Applications import this in their hydrate bundle.
 *
 * Importing this module registers every framework custom element (link + image) as a side
 * effect. Pages/layouts can use `<seawomp-link>` and `<seawomp-image>` without an explicit
 * import statement. */
import './link.js'; // side-effect: registers <seawomp-link>
import '../components/index.js'; // side-effect: registers <seawomp-image> and any future built-ins
export { hydrate } from 'wompo/hydrate';
export { navigate, prefetchRoute, setRoutes, setRouterOptions, clearPrefetchCache, } from './router.js';
export { applyHead } from './head.js';
export { callAction, ActionError } from './actions.js';

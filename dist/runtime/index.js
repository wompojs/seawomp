/* Public client runtime entry. Applications import this in their hydrate bundle.
 *
 * Importing this module registers every framework component (link + image) as a side
 * effect. Pages/layouts can use `<seawomp-link>` and `<seawomp-image>` without an explicit
 * import statement. */
import '../components/index.js'; // side-effect: registers built-in Wompo components
export { hydrate } from 'wompo/hydrate';
export { navigate, prefetchRoute, setRoutes, setRouterOptions, clearPrefetchCache, useRoute, useNavigationState, getNavigationSnapshot, } from './router.js';
export { applyHead } from './head.js';
export { callAction, ActionError } from './actions.js';
export { setClientI18nConfig } from '../i18n/context.js';

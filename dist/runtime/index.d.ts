import './link.js';
import '../components/index.js';
export { hydrate } from 'wompo/hydrate';
export { navigate, prefetchRoute, setRoutes, setRouterOptions, clearPrefetchCache, } from './router.js';
export type { RouteRecord, RouterOptions } from './router.js';
export { applyHead } from './head.js';
export { callAction, ActionError } from './actions.js';
export type { CallActionOptions } from './actions.js';

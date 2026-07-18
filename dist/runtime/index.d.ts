import '../components/index.js';
export { hydrate } from 'wompo/hydrate';
export { navigate, prefetchRoute, setRoutes, setSpecialRoutes, setRouterOptions, clearPrefetchCache, canonicalPathname, useRoute, useNavigationState, getNavigationSnapshot, } from './router.js';
export type { RouteRecord, SpecialRouteRecord, SpecialRouteRecords, RouteSnapshot, RouterOptions, RouterI18nConfig, RouterViewTransitionOptions, NavigationState, NavigationSnapshot, } from './router.js';
export { applyHead } from './head.js';
export { callAction, ActionError } from './actions.js';
export type { CallActionOptions } from './actions.js';
export { setClientI18nConfig } from '../i18n/context.js';

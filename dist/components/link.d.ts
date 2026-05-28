import { type WompoProps } from 'wompo';
type PrefetchMode = 'hover' | 'visible' | 'none';
export interface SeawompLinkProps extends WompoProps {
    href?: string;
    /** Force the target locale (e.g. on a language switcher). Defaults to the active locale. */
    locale?: string;
    /** Set to `"path"` to make the resolved href follow the *current* URL pathname instead of the
     * `href` prop. Combined with `locale`, this is the canonical language-switcher pattern:
     * `<Link locale="it" follow="path">IT</Link>` always points to the current page in Italian,
     * even after SPA navigations have changed the pathname. */
    follow?: 'path';
    target?: string;
    rel?: string;
    download?: string | boolean;
    title?: string;
    ariaLabel?: string;
    ariaCurrent?: string;
    prefetch?: PrefetchMode;
    prefetchDelay?: number | string;
    preloadModules?: boolean | string;
    active?: boolean;
}
declare function SeawompLink(props: SeawompLinkProps): import("wompo").RenderHtml;
declare namespace SeawompLink {
    var css: string;
}
export default SeawompLink;

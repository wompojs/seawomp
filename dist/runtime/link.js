if (typeof HTMLElement !== 'undefined') {
    const { navigate, prefetchRoute } = await import('./router.js');
    const DEFAULT_DELAY = 50;
    let observer = null;
    const observed = new WeakMap();
    function getObserver() {
        if (observer)
            return observer;
        observer = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting)
                    continue;
                const meta = observed.get(e.target);
                if (!meta)
                    continue;
                prefetchRoute(meta.href, { preloadModules: meta.preloadModules });
                observer.unobserve(e.target);
                observed.delete(e.target);
            }
        }, { rootMargin: '200px' });
        return observer;
    }
    class SeawompLink extends HTMLElement {
        _hoverTimer;
        _mode = 'hover';
        _delay = DEFAULT_DELAY;
        _preloadModules = true;
        connectedCallback() {
            const a = this.querySelector('a');
            if (!a)
                return;
            this._mode = this.getAttribute('prefetch') || 'hover';
            const rawDelay = this.getAttribute('prefetch-delay');
            if (rawDelay && !isNaN(+rawDelay))
                this._delay = +rawDelay;
            this._preloadModules = this.getAttribute('preload-modules') !== 'false';
            a.addEventListener('click', this._onClick);
            if (this._mode === 'hover') {
                this.addEventListener('mouseenter', this._onHover);
                this.addEventListener('mouseleave', this._cancelHover);
                this.addEventListener('focusin', this._onHover);
            }
            else if (this._mode === 'visible') {
                const href = a.getAttribute('href');
                if (href && !href.startsWith('http')) {
                    observed.set(this, { href, preloadModules: this._preloadModules });
                    getObserver().observe(this);
                }
            }
        }
        disconnectedCallback() {
            this._cancelHover();
            if (observer && observed.has(this)) {
                observer.unobserve(this);
                observed.delete(this);
            }
        }
        _onClick = (e) => {
            const a = this.querySelector('a');
            if (!a)
                return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('//'))
                return;
            if (e.metaKey || e.ctrlKey || e.shiftKey)
                return;
            e.preventDefault();
            navigate(href);
        };
        _onHover = () => {
            this._cancelHover();
            const a = this.querySelector('a');
            if (!a)
                return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('http'))
                return;
            this._hoverTimer = window.setTimeout(() => prefetchRoute(href, { preloadModules: this._preloadModules }), this._delay);
        };
        _cancelHover = () => {
            if (this._hoverTimer !== undefined) {
                clearTimeout(this._hoverTimer);
                this._hoverTimer = undefined;
            }
        };
    }
    if (typeof customElements !== 'undefined' && !customElements.get('seawomp-link')) {
        customElements.define('seawomp-link', SeawompLink);
    }
}
export {};

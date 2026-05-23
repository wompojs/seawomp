/* <seawomp-link> — anchor wrapper that triggers the client router with hover/visibility
 * prefetch and modulepreload emission.
 *
 * Usage:
 *   <seawomp-link href="/blog/1"><a href="/blog/1">Read</a></seawomp-link>
 *
 *   <seawomp-link prefetch="visible"><a href="/work">Work</a></seawomp-link>
 *   <seawomp-link prefetch="none" preload-modules="false">…</seawomp-link>
 *
 * Attributes:
 *   prefetch         — "hover" (default) | "visible" | "none"
 *   prefetch-delay   — hover debounce in ms (default 50)
 *   preload-modules  — "false" to skip injecting `<link rel="modulepreload">`
 */
export {}; // ensure ESM

if (typeof HTMLElement !== 'undefined') {
	const { navigate, prefetchRoute } = await import('./router.js');

	const DEFAULT_DELAY = 50;
	let observer: IntersectionObserver | null = null;
	const observed = new WeakMap<Element, { href: string; preloadModules: boolean }>();

	function getObserver(): IntersectionObserver {
		if (observer) return observer;
		observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (!e.isIntersecting) continue;
					const meta = observed.get(e.target);
					if (!meta) continue;
					prefetchRoute(meta.href, { preloadModules: meta.preloadModules });
					observer!.unobserve(e.target);
					observed.delete(e.target);
				}
			},
			{ rootMargin: '200px' },
		);
		return observer;
	}

	class SeawompLink extends HTMLElement {
		private _hoverTimer: number | undefined;
		private _mode: 'hover' | 'visible' | 'none' = 'hover';
		private _delay = DEFAULT_DELAY;
		private _preloadModules = true;

		connectedCallback(): void {
			const a = this.querySelector('a');
			if (!a) return;

			this._mode = (this.getAttribute('prefetch') as 'hover' | 'visible' | 'none') || 'hover';
			const rawDelay = this.getAttribute('prefetch-delay');
			if (rawDelay && !isNaN(+rawDelay)) this._delay = +rawDelay;
			this._preloadModules = this.getAttribute('preload-modules') !== 'false';

			a.addEventListener('click', this._onClick);

			if (this._mode === 'hover') {
				this.addEventListener('mouseenter', this._onHover);
				this.addEventListener('mouseleave', this._cancelHover);
				this.addEventListener('focusin', this._onHover);
			} else if (this._mode === 'visible') {
				const href = a.getAttribute('href');
				if (href && !href.startsWith('http')) {
					observed.set(this, { href, preloadModules: this._preloadModules });
					getObserver().observe(this);
				}
			}
		}

		disconnectedCallback(): void {
			this._cancelHover();
			if (observer && observed.has(this)) {
				observer.unobserve(this);
				observed.delete(this);
			}
		}

		private _onClick = (e: Event): void => {
			const a = this.querySelector('a');
			if (!a) return;
			const href = a.getAttribute('href');
			if (!href || href.startsWith('http') || href.startsWith('//')) return;
			if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey)
				return;
			e.preventDefault();
			navigate(href);
		};

		private _onHover = (): void => {
			this._cancelHover();
			const a = this.querySelector('a');
			if (!a) return;
			const href = a.getAttribute('href');
			if (!href || href.startsWith('http')) return;
			this._hoverTimer = window.setTimeout(
				() => prefetchRoute(href, { preloadModules: this._preloadModules }),
				this._delay,
			);
		};

		private _cancelHover = (): void => {
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

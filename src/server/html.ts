/* HTML document shell.
 *
 * The SSR result fills the BODY content. This module wraps it in a full `<!doctype html>` so the
 * dev/prod handler can pipe a single response. The shell is intentionally minimal — apps
 * customize via `app/layout.ts` and `app/page.ts`'s `head` export.
 */

export interface ShellOptions {
	title?: string;
	/** Framework-generated tags injected into `<head>` (discoverability, manifests, etc.). */
	frameworkHead?: string;
	/** Per-page `<head>` fragment (from `pageMod.head(props)`), already tagged with
	 * `data-seawomp-head`. Injected after `frameworkHead`; if it contains a `<title>` the
	 * default shell title is suppressed so we don't emit two `<title>` tags. */
	pageHead?: string;
	/** ES module URL the client should load for hydration. */
	hydrateScript?: string;
	/** Optional language attribute. */
	lang?: string;
}

export function openShell(opts: ShellOptions = {}): string {
	const {
		title = 'seawomp',
		frameworkHead = '',
		pageHead = '',
		hydrateScript = '/_hydrate.js',
		lang = 'en',
	} = opts;
	const pageHasTitle = /<title[\s>]/i.test(pageHead);
	const defaultTitle = pageHasTitle ? '' : `<title>${escapeHtml(title)}</title>`;
	return (
		`<!doctype html><html lang="${lang}"><head>` +
		`<meta charset="utf-8" />` +
		`<meta name="viewport" content="width=device-width, initial-scale=1" />` +
		defaultTitle +
		frameworkHead +
		pageHead +
		`</head><body>`
	);
}

export function closeShell(hydrateScript = '/_hydrate.js'): string {
	return `<script type="module" src="${hydrateScript}"></script></body></html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

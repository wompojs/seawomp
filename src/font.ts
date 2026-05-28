import { html, type RenderHtml } from 'wompo';

export interface GoogleFontOptions {
	/** Font family name, for example `Inter` or `Source Sans 3`. */
	family: string;
	/** Font weights to request. Defaults to Google's regular style. */
	weights?: Array<string | number>;
	/** CSS font-display value. Default: `swap`. */
	display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
	/** Optional Google Fonts text subset. */
	text?: string;
}

export const Font = {
	google(options: GoogleFontOptions): RenderHtml {
		const href = googleFontsHref(options);
		return html`
			<link rel="preconnect" href="https://fonts.googleapis.com">
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
			<link rel="stylesheet" href="${href}" data-seawomp-font="google">
		`;
	},
};

function googleFontsHref(options: GoogleFontOptions): string {
	const family = options.family.trim().replace(/\s+/g, '+');
	const weights = options.weights?.map(String).filter(Boolean);
	const familyValue = weights?.length ? `${family}:wght@${weights.join(';')}` : family;
	const params = [`family=${familyValue}`, `display=${options.display ?? 'swap'}`];
	if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
	return `https://fonts.googleapis.com/css2?${params.join('&')}`;
}

import { html } from 'wompo';
export const Font = {
    google(options) {
        const href = googleFontsHref(options);
        return html `
			<link rel="preconnect" href="https://fonts.googleapis.com">
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
			<link rel="stylesheet" href="${href}" data-seawomp-font="google">
		`;
    },
};
function googleFontsHref(options) {
    const family = options.family.trim().replace(/\s+/g, '+');
    const weights = options.weights?.map(String).filter(Boolean);
    const familyValue = weights?.length ? `${family}:wght@${weights.join(';')}` : family;
    const params = [`family=${familyValue}`, `display=${options.display ?? 'swap'}`];
    if (options.text)
        params.push(`text=${encodeURIComponent(options.text)}`);
    return `https://fonts.googleapis.com/css2?${params.join('&')}`;
}

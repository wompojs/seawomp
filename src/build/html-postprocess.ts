import { minifyHtmlShell } from './minify-html.js';

export interface HtmlPostProcessOptions {
	minify?: boolean;
	optimizeLcp?: boolean;
}

export function postProcessHtml(html: string, opts: HtmlPostProcessOptions = {}): string {
	let out = opts.optimizeLcp ? optimizeLcpImage(html) : html;
	if (opts.minify) out = minifyHtmlShell(out);
	return out;
}

export function optimizeLcpImage(html: string): string {
	const imgMatch = findLcpCandidate(html);
	if (!imgMatch) return html;

	const original = imgMatch[0];
	let optimized = setOrReplaceAttr(original, 'fetchpriority', 'high');
	optimized = setOrReplaceAttr(optimized, 'decoding', 'sync');
	optimized = setOrReplaceAttr(optimized, 'loading', 'eager', { replaceLazyOnly: true });

	let out = html.slice(0, imgMatch.index) + optimized + html.slice(imgMatch.index + original.length);
	const preload = buildImagePreload(optimized);
	if (!preload || hasImagePreload(out, preload.href)) return out;
	return out.replace(/<\/head>/i, `${preload.tag}</head>`);
}

function findLcpCandidate(html: string): RegExpExecArray | null {
	const re = /<img\b[^>]*>/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(html))) {
		const tag = match[0];
		if (/\bdata-seawomp-lcp=["']?false["']?/i.test(tag)) continue;
		if (/\bfetchpriority\s*=\s*["']?high["']?/i.test(tag)) continue;
		if (!/\bsrc\s*=/i.test(tag)) continue;
		return match;
	}
	return null;
}

function setOrReplaceAttr(
	tag: string,
	name: string,
	value: string,
	opts: { replaceLazyOnly?: boolean } = {},
): string {
	const attr = new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, 'i');
	const match = tag.match(attr);
	if (!match) return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
	if (opts.replaceLazyOnly && match[2].toLowerCase() !== 'lazy') return tag;
	return tag.replace(attr, ` ${name}="${value}"`);
}

function buildImagePreload(tag: string): { href: string; tag: string } | null {
	const src = attrValue(tag, 'src');
	if (!src || src.startsWith('data:')) return null;
	const srcset = attrValue(tag, 'srcset');
	const sizes = attrValue(tag, 'sizes');
	let preload = `<link rel="preload" as="image" href="${escapeAttr(src)}" fetchpriority="high"`;
	if (srcset) preload += ` imagesrcset="${escapeAttr(srcset)}"`;
	if (sizes) preload += ` imagesizes="${escapeAttr(sizes)}"`;
	preload += '>';
	return { href: src, tag: preload };
}

function hasImagePreload(html: string, href: string): boolean {
	const escaped = escapeRegex(href);
	const re = new RegExp(`<link\\b(?=[^>]*rel=["']?preload["']?)(?=[^>]*as=["']?image["']?)(?=[^>]*href=["']${escaped}["'])[^>]*>`, 'i');
	return re.test(html);
}

function attrValue(tag: string, name: string): string | null {
	const quoted = new RegExp(`\\s${name}\\s*=\\s*(['"])(.*?)\\1`, 'i').exec(tag);
	if (quoted) return quoted[2];
	const bare = new RegExp(`\\s${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
	return bare ? bare[1] : null;
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

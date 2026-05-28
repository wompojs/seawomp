import { compileRoutePattern } from '../shared/paths.js';
export function compileRedirects(rules = []) {
    return rules.map((rule) => ({
        ...rule,
        ...compileRoutePattern(normalizePattern(rule.source)),
        status: rule.status ?? 307,
    }));
}
export function matchRedirect(pathname, search, rules) {
    for (const rule of rules) {
        const match = pathname.match(rule.regex);
        if (!match)
            continue;
        const params = {};
        rule.paramNames.forEach((name, index) => {
            params[name] = decodeURIComponent(match[index + 1] || '');
        });
        let destination = interpolateDestination(rule.destination, params);
        if (search && !destination.includes('?'))
            destination += search;
        return new Response(null, {
            status: rule.status ?? 307,
            headers: { location: destination },
        });
    }
    return null;
}
function normalizePattern(pattern) {
    return pattern.startsWith('/') ? pattern : '/' + pattern;
}
function interpolateDestination(destination, params) {
    return destination.replace(/:([A-Za-z0-9_]+)\*?/g, (token, name) => {
        if (!Object.prototype.hasOwnProperty.call(params, name))
            return token;
        return encodePathParam(params[name], token.endsWith('*'));
    });
}
function encodePathParam(value, catchAll) {
    if (!catchAll)
        return encodeURIComponent(value);
    return value
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

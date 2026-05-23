/* Server-action endpoint.
 *
 * `defineAction(fn)` in wompo/ssr registers `fn` under a stable id and returns a wrapped function
 * that, when serialized as an island prop, carries a `{__wompoAction: '<id>'}` marker. This
 * handler exposes those registered actions over HTTP: `POST /_action/:id` with a devalue-encoded
 * argument array as the body. The response is the devalue-encoded return value.
 *
 * Wire format:
 *   POST /_action/:id
 *   Content-Type: application/json
 *   Body: devalue.stringify([arg0, arg1, …])
 *
 *   200 OK → devalue.stringify(returnValue)
 *   404    → unknown action id
 *   400    → malformed body
 *   500    → action threw
 */
import * as ssr from 'wompo/ssr';
const ACTION_PATH = '/_action/';
/** Returns `true` if the URL pathname matches the action endpoint. */
export function isActionRequest(pathname, prefix = ACTION_PATH) {
    return pathname.startsWith(prefix);
}
/** Handle an action invocation. Resolves to a Response. */
export async function dispatchAction(request, opts = {}) {
    const prefix = opts.pathPrefix ?? ACTION_PATH;
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) {
        return new Response('Not Found', { status: 404 });
    }
    const id = url.pathname.slice(prefix.length).replace(/\/$/, '');
    const reg = ssr.getRegisteredAction(id);
    if (!reg)
        return new Response(`Unknown action: ${id}`, { status: 404 });
    let bodyText = '';
    try {
        bodyText = await request.text();
    }
    catch {
        return new Response('Could not read request body', { status: 400 });
    }
    let args = [];
    if (bodyText) {
        try {
            const parsed = ssr.devalue.parse(bodyText);
            if (!Array.isArray(parsed)) {
                return new Response('Body must be a devalue-encoded array of args', { status: 400 });
            }
            args = parsed;
        }
        catch (err) {
            return new Response('Body parse failed: ' + err.message, { status: 400 });
        }
    }
    let result;
    try {
        result = await reg.fn(...args);
    }
    catch (err) {
        return new Response('Action threw: ' + err.message, { status: 500 });
    }
    return new Response(ssr.devalue.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

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

export interface ActionDispatchOptions {
  /** Override the URL prefix matched against the request (default `/_action/`). */
  pathPrefix?: string;
}

/** Returns `true` if the URL pathname matches the action endpoint. */
export function isActionRequest(pathname: string, prefix = ACTION_PATH): boolean {
  return pathname.startsWith(prefix);
}

/** Handle an action invocation. Resolves to a Response. */
export async function dispatchAction(
  request: Request,
  opts: ActionDispatchOptions = {},
): Promise<Response> {
  const prefix = opts.pathPrefix ?? ACTION_PATH;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(prefix)) {
    return new Response('Not Found', { status: 404 });
  }
  const id = url.pathname.slice(prefix.length).replace(/\/$/, '');
  const reg = (ssr as any).getRegisteredAction(id);
  if (!reg) return new Response(`Unknown action: ${id}`, { status: 404 });

  let bodyText = '';
  try {
    bodyText = await request.text();
  } catch {
    return new Response('Could not read request body', { status: 400 });
  }
  let args: unknown[] = [];
  if (bodyText) {
    try {
      const parsed = (ssr as any).devalue.parse(bodyText);
      if (!Array.isArray(parsed)) {
        return new Response('Body must be a devalue-encoded array of args', { status: 400 });
      }
      args = parsed;
    } catch (err) {
      return new Response('Body parse failed: ' + (err as Error).message, { status: 400 });
    }
  }

  let result: unknown;
  try {
    result = await reg.fn(...args);
  } catch (err) {
    return new Response('Action threw: ' + (err as Error).message, { status: 500 });
  }
  return new Response((ssr as any).devalue.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

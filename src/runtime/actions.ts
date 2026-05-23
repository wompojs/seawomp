/* Client-side helper for invoking server actions.
 *
 * Mirror of the server's `/_action/:id` contract: arguments are devalue-encoded into a JSON
 * array, the response body is devalue-encoded too (so composite return values like `Date`,
 * `Map`, `Set`, `BigInt`, and cyclic objects survive the trip). On HTTP error, throws an
 * `ActionError` carrying the status code and the response text for diagnostics.
 */
import { parse, stringify } from 'wompo/devalue';

const ACTION_PATH = '/_action/';

export class ActionError extends Error {
  constructor(public id: string, public status: number, public detail: string) {
    super(`Action "${id}" failed (${status}): ${detail}`);
    this.name = 'ActionError';
  }
}

export interface CallActionOptions {
  /** Override the URL prefix (default `/_action/`). Useful for mounting under a basepath. */
  pathPrefix?: string;
  /** Forwarded to fetch — pass an AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export async function callAction<R = unknown>(
  id: string,
  args: unknown[] = [],
  opts: CallActionOptions = {},
): Promise<R> {
  const prefix = opts.pathPrefix ?? ACTION_PATH;
  const r = await fetch(prefix + id, {
    method: 'POST',
    body: stringify(args),
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    signal: opts.signal,
  });
  const text = await r.text();
  if (!r.ok) throw new ActionError(id, r.status, text);
  return parse(text) as R;
}

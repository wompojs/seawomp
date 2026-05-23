/* Server-action endpoint tests. */
import { describe, expect, it } from 'bun:test';
// @ts-ignore — using built dist of wompo for SSR APIs
import { defineAction, devalue } from 'wompo/ssr';
import { dispatchAction } from '../../src/server/action-handler.js';
import { createHandler } from '../../src/server/handler.js';

describe('server actions', () => {
  it('round-trips arguments and return value', async () => {
    const add = defineAction(async (a: number, b: number) => a + b, 'unit-add');
    expect(typeof add).toBe('function');

    const req = new Request('http://x/_action/unit-add', {
      method: 'POST',
      body: devalue.stringify([2, 3]),
    });
    const res = await dispatchAction(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(devalue.parse(body)).toBe(5);
  });

  it('returns 404 for an unknown action id', async () => {
    const req = new Request('http://x/_action/nope-nope', { method: 'POST', body: '[]' });
    const res = await dispatchAction(req);
    expect(res.status).toBe(404);
  });

  it('returns 500 with the error message when the action throws', async () => {
    defineAction(async () => {
      throw new Error('boom!');
    }, 'unit-boom');
    const req = new Request('http://x/_action/unit-boom', {
      method: 'POST',
      body: devalue.stringify([]),
    });
    const res = await dispatchAction(req);
    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/boom!/);
  });

  it('integrates with the main handler via POST /_action/:id', async () => {
    defineAction(async (name: string) => `hello-${name}`, 'unit-greet');
    const handler = createHandler({ routes: [], loadModule: async () => ({}) });
    const req = new Request('http://x/_action/unit-greet', {
      method: 'POST',
      body: devalue.stringify(['world']),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(devalue.parse(await res.text())).toBe('hello-world');
  });

  it('supports composite return values (objects, dates)', async () => {
    defineAction(async () => ({ at: new Date('2024-05-01'), n: 42 }), 'unit-rich');
    const req = new Request('http://x/_action/unit-rich', {
      method: 'POST',
      body: devalue.stringify([]),
    });
    const res = await dispatchAction(req);
    const result = devalue.parse(await res.text()) as { at: Date; n: number };
    expect(result.n).toBe(42);
    expect(result.at).toBeInstanceOf(Date);
    expect(result.at.toISOString()).toBe('2024-05-01T00:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';
import handler from '../api/page.js';

/**
 * The handler as the deployment calls it.
 *
 * `server/page.test.ts` covers the fetching; this covers the shape of the
 * call, which is where both of the deployment's failures were. The host
 * hands the handler a request whose `url` is a path rather than the absolute
 * URL a `Request` normally carries, and nothing local does that — dev,
 * preview and every test built an absolute one — so the parse threw only on
 * the deployment, and only where no log was being read.
 */

function asked(path: string, headers: Record<string, string> = {}): Request {
  // A hand-made request: `new Request` normalises a path into an absolute
  // URL, which is exactly the thing being tested.
  return { url: path, method: 'GET', headers: new Headers(headers) } as Request;
}

describe('the function behind /api/page', () => {
  it('reads the address out of a request whose url is a path', async () => {
    const response = await handler(asked('/api/page?url=https%3A%2F%2Fexample.com%2F'));
    // Refused for coming from nowhere, not crashed on the parse.
    expect(response.status).toBe(403);
  });

  it('answers a request from the app, and still refuses a private address', async () => {
    const response = await handler(
      asked('/api/page?url=http%3A%2F%2F127.0.0.1%2F', {
        'sec-fetch-site': 'same-origin',
        host: 'lumen.example',
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('cannot be fetched from here');
  });

  it('has nothing to fetch when no address was given', async () => {
    const response = await handler(asked('/api/page'));
    expect(response.status).toBe(400);
  });
});

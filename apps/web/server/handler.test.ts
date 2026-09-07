import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { servePage } from './page';

/**
 * The endpoint as the host calls it.
 *
 * `page.test.ts` covers the fetching; this covers the shape of the call,
 * which is where every one of the deployment's failures was. A function is
 * handed a Node request — `url` a path, `headers` a plain object — and a
 * handler written against `Request` throws on the first line that reads
 * either. Nothing local reproduced that while dev and the deployment ran two
 * different copies of this, which is why they no longer do.
 */

interface Answer {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function ask(url: string, headers: Record<string, string> = {}): Promise<Answer> {
  const answer: Answer = { status: 0, headers: {}, body: '' };
  const req = { url, method: 'GET', headers } as unknown as IncomingMessage;
  const res = {
    set statusCode(value: number) {
      answer.status = value;
    },
    setHeader(name: string, value: string) {
      answer.headers[name.toLowerCase()] = value;
    },
    end(body: string) {
      answer.body = body;
    },
  } as unknown as ServerResponse;
  await servePage(req, res);
  return answer;
}

describe('the function behind /api/page', () => {
  it('reads the address out of a request whose url is a path', async () => {
    // Refused for coming from nowhere, which means the path was parsed and
    // the headers were read rather than throwing on either.
    const answer = await ask('/api/page?url=https%3A%2F%2Fexample.com%2F');
    expect(answer.status).toBe(403);
    expect(answer.body).toContain('Lumen browser');
  });

  it('answers a request from the app, and still refuses a private address', async () => {
    const answer = await ask('/api/page?url=http%3A%2F%2F127.0.0.1%2F', {
      'sec-fetch-site': 'same-origin',
      host: 'lumen.example',
    });
    expect(answer.status).toBe(400);
    expect(answer.body).toContain('cannot be fetched from here');
  });

  it('has nothing to fetch when no address was given', async () => {
    expect((await ask('/api/page')).status).toBe(400);
  });

  it('takes GET and nothing else', async () => {
    const answer: Answer = { status: 0, headers: {}, body: '' };
    const req = { url: '/api/page', method: 'POST', headers: {} } as unknown as IncomingMessage;
    const res = {
      set statusCode(value: number) {
        answer.status = value;
      },
      setHeader() {},
      end(body: string) {
        answer.body = body;
      },
    } as unknown as ServerResponse;
    await servePage(req, res);
    expect(answer.status).toBe(405);
  });

  it('sends a refusal that no crawler or shared cache will keep', async () => {
    const answer = await ask('/api/page?url=https%3A%2F%2Fexample.com%2F');
    expect(answer.headers['x-robots-tag']).toContain('noindex');
    expect(answer.headers['cache-control']).toContain('private');
    expect(answer.headers['referrer-policy']).toBe('no-referrer');
  });
});

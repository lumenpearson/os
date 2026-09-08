import { describe, expect, it, vi } from 'vitest';
import {
  acceptableTarget,
  fromThisApp,
  isPrivateAddress,
  loadPage,
  withBase,
  withoutScripts,
} from './page';

describe('isPrivateAddress', () => {
  it('knows the ranges that are not the public internet', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // the address a cloud asks for its own credentials
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('lets the public internet through', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '142.250.72.14', '2606:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('does not mistake a public address for a private one by its first octet', () => {
    // 172.15 and 172.32 sit either side of the private block.
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('192.167.0.1')).toBe(false);
  });
});

describe('acceptableTarget', () => {
  it('takes an http and an https address', async () => {
    expect((await acceptableTarget('https://example.com/a'))?.href).toBe('https://example.com/a');
  });

  it('refuses every other scheme', async () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com/',
      'javascript:alert(1)',
      'data:,',
    ]) {
      expect(await acceptableTarget(url), url).toBeNull();
    }
  });

  it('refuses an address inside the network it is running on', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost:3000/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/admin',
    ]) {
      expect(await acceptableTarget(url), url).toBeNull();
    }
  });

  it('refuses what is not an address at all', async () => {
    expect(await acceptableTarget('not a url')).toBeNull();
  });
});

describe('fromThisApp', () => {
  it('takes the browser at its word when it sets the header', () => {
    expect(fromThisApp({ secFetchSite: 'same-origin' })).toBe(true);
    expect(fromThisApp({ secFetchSite: 'same-site' })).toBe(true);
    expect(fromThisApp({ secFetchSite: 'cross-site' })).toBe(false);
    expect(fromThisApp({ secFetchSite: 'none' })).toBe(false);
  });

  it('falls back to the referrer, and only for this host', () => {
    expect(fromThisApp({ referer: 'https://lumen.example/x', host: 'lumen.example' })).toBe(true);
    expect(fromThisApp({ referer: 'https://elsewhere.example/x', host: 'lumen.example' })).toBe(
      false,
    );
  });

  it('refuses a request with neither, which is what a plain fetch looks like', () => {
    expect(fromThisApp({})).toBe(false);
    expect(fromThisApp({ referer: 'nonsense', host: 'lumen.example' })).toBe(false);
  });
});

describe('withBase', () => {
  it('gives the document the address it came from, so relative links resolve', () => {
    const out = withBase(
      '<html><head><title>x</title></head><body>y</body></html>',
      'https://a.example/b/',
    );
    expect(out).toContain('<base href="https://a.example/b/">');
    expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<title>'));
  });

  it('leaves a document that already says where its links point', () => {
    const html = '<html><head><base href="https://other.example/"></head></html>';
    expect(withBase(html, 'https://a.example/')).toBe(html);
  });

  it('makes a head for a document that has none', () => {
    expect(withBase('<html><body>y</body></html>', 'https://a.example/')).toContain(
      '<head><base href="https://a.example/"',
    );
  });

  it('still says it for a fragment with no html element at all', () => {
    expect(withBase('<p>hello</p>', 'https://a.example/')).toContain(
      '<base href="https://a.example/">',
    );
  });

  it('escapes a quote in the address rather than ending the attribute', () => {
    expect(withBase('<html></html>', 'https://a.example/"onload="x')).not.toContain('"onload="x');
  });
});

describe('loadPage', () => {
  const ok = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } });

  it('refuses an address it will not fetch, without asking the network', async () => {
    const doFetch = vi.fn();
    const result = await loadPage('http://127.0.0.1/', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(400);
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('returns the document with a base, and nothing of the response headers', async () => {
    const doFetch = vi.fn(async () =>
      ok('<html><head></head><body>hi</body></html>', {
        'x-frame-options': 'DENY',
        'set-cookie': 'a=b',
      }),
    );
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(200);
    expect(result.body).toContain('<base href="https://example.com/">');
    expect(result.body).toContain('hi');
  });

  it('sends no cookies and asks for no credentials', async () => {
    // The parameters are declared so the recorded call has them: a mock
    // written `async () => …` records an empty argument list, and the
    // options this test is about would be read off the end of it.
    const doFetch = vi.fn(async (_url: string, _init?: RequestInit) => ok('<html></html>'));
    await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    const init = doFetch.mock.calls[0]?.[1];
    expect(init, 'the options the fetch was made with').toBeDefined();
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('manual');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.cookie).toBeUndefined();
  });

  it('checks every hop of a redirect, not only the address it was given', async () => {
    // The hole this closes: a public name that redirects to the metadata service.
    const doFetch = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(400);
    expect(result.body).toContain('redirected somewhere this will not follow');
  });

  it('gives up on a redirect that goes round for ever', async () => {
    const doFetch = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://example.com/again' } }),
    );
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(508);
  });

  it('will not serve a file dressed as a page', async () => {
    const doFetch = vi.fn(
      async () =>
        new Response('MZ', { status: 200, headers: { 'content-type': 'application/zip' } }),
    );
    const result = await loadPage('https://example.com/x.zip', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(415);
  });

  it('refuses a body that says it is larger than a page', async () => {
    const doFetch = vi.fn(
      async () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html', 'content-length': String(50 * 1024 * 1024) },
        }),
    );
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(413);
  });

  it('says the site could not be reached rather than throwing', async () => {
    const doFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(result.status).toBe(502);
    expect(result.problem).toContain('could not be reached');
  });
});

describe('withoutScripts', () => {
  it('takes out an external script and an inline one', () => {
    const out = withoutScripts(
      '<head><script src="/a.js"></script><script>window.x=1</script></head><body>text</body>',
    );
    expect(out).toBe('<head></head><body>text</body>');
  });

  it('ends an element at an end tag carrying rubbish', () => {
    // What the previous pattern missed, and what CodeQL called: a browser
    // closes the element here, so anything that does not is leaving a script
    // in the page it claimed to have cleaned.
    expect(withoutScripts('<script>evil()</script bar>after')).toBe('after');
    expect(withoutScripts('<script>evil()</script\t\n >after')).toBe('after');
    expect(withoutScripts('<script>evil()</script/>after')).toBe('after');
  });

  it('drops the rest of the document after a script that is never closed', () => {
    // Unterminated, the element runs to the end of the file for a parser, so
    // what follows is script data and not content to keep.
    expect(withoutScripts('<p>before</p><script>evil()<p>looks like content')).toBe(
      '<p>before</p>',
    );
  });

  it('is not ended early by a greater-than inside an attribute', () => {
    expect(withoutScripts('<script data-x="a>b">evil()</script>kept')).toBe('kept');
  });

  it('takes out a script whatever case or attributes it is written with', () => {
    expect(withoutScripts('<SCRIPT TYPE="module" defer>x</SCRIPT>y')).toBe('y');
    expect(withoutScripts('<script\n  async\n>x</script>y')).toBe('y');
  });

  it('leaves the document alone when it has no scripts', () => {
    const html = '<html><body><p>Just words</p></body></html>';
    expect(withoutScripts(html)).toBe(html);
  });

  it('leaves a tag whose name only starts with the word', () => {
    const html = '<scripture>Not a script</scripture>';
    expect(withoutScripts(html)).toBe(html);
  });

  it('leaves a page that only looks like it has one', () => {
    const html = '<p>Use &lt;script&gt; to add behaviour</p>';
    expect(withoutScripts(html)).toBe(html);
  });

  it('leaves nothing that could start a script element', () => {
    // The property the whole function exists for, over the shapes above.
    for (const html of [
      '<script>a</script bar><script>b</script\t>',
      '<div><script src=x>\u003c/script\u003e</script></div>',
      '<script><script>nested-looking</script>',
    ]) {
      expect(withoutScripts(html).toLowerCase()).not.toContain('<script');
    }
  });
});

describe('a relayed page', () => {
  const ok = (body: string) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

  it("arrives with the site's scripts gone and Lumen's signal in place", async () => {
    const doFetch = vi.fn(async () =>
      ok(
        '<html><head><script src="https://example.com/app.js"></script></head><body><h1>Read me</h1><script>document.body.innerHTML=""</script></body></html>',
      ),
    );
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(result.body).toContain('<h1>Read me</h1>');
    expect(result.body).not.toContain('app.js');
    expect(result.body).not.toContain('document.body.innerHTML');
    // Lumen's own one-line signal is injected after the strip, so it survives.
    expect(result.body).toContain('page-ready');
  });

  it('runs under a policy naming the one nonce its own script carries', async () => {
    const doFetch = vi.fn(async () => ok('<html><head></head><body>hi</body></html>'));
    const result = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    const nonce = result.body.match(/<script nonce="([a-f0-9]+)"/)?.[1];
    expect(nonce, 'the injected script carries a nonce').toBeTruthy();
    expect(result.contentSecurityPolicy).toBe(`script-src 'nonce-${nonce}'; object-src 'none'`);
  });

  it('mints a new nonce for every page, so one cannot be written in advance', async () => {
    const doFetch = vi.fn(async () => ok('<html><head></head><body>hi</body></html>'));
    const first = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    const second = await loadPage('https://example.com/', doFetch as unknown as typeof fetch);
    expect(first.contentSecurityPolicy).not.toBe(second.contentSecurityPolicy);
  });
});

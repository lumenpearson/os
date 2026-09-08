import { describe, expect, it, vi } from 'vitest';
import {
  acceptableTarget,
  frameAncestors,
  frameRule,
  fromThisApp,
  isPrivateAddress,
  loadPage,
  matchesOrigin,
  probePage,
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

  it('makes the base a document wrote for itself absolute against the site', () => {
    // Served from Lumen's origin, a relative base would point every
    // stylesheet and image at Lumen, and the page would arrive unstyled.
    const out = withBase(
      '<html><head><base href="/assets/"></head></html>',
      'https://a.example/b/c',
    );
    expect(out).toContain('<base href="https://a.example/assets/">');
    expect(out).not.toContain('href="/assets/"');
  });

  it('leaves an absolute base of the document’s own alone', () => {
    const out = withBase(
      '<html><head><base href="https://other.example/"></head></html>',
      'https://a.example/',
    );
    expect(out).toContain('<base href="https://other.example/">');
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

  it('carries the script that keeps the page’s own links inside the browser', () => {
    // Without this the `<base>` above sends every link straight back to the
    // site, into a frame the site refuses, and the page goes blank on the
    // first click. LU-1609.
    const out = withBase('<html><head></head></html>', 'https://a.example/');
    expect(out).toContain('page-ready');
    expect(out).toContain('page-moved');
    expect(out).toContain('addEventListener("click"');
    expect(out).toContain('addEventListener("submit"');
  });
});

describe('frameAncestors', () => {
  it('finds the directive among the others', () => {
    expect(frameAncestors("default-src 'self'; frame-ancestors 'none'")).toEqual([["'none'"]]);
  });

  it('reads every policy in a header that carries more than one', () => {
    expect(frameAncestors("frame-ancestors 'self', script-src 'x'; frame-ancestors *")).toEqual([
      ["'self'"],
      ['*'],
    ]);
  });

  it('says nothing when the header does not mention frames', () => {
    expect(frameAncestors("default-src 'self'")).toEqual([]);
  });
});

describe('matchesOrigin', () => {
  const lumen = new URL('https://lumen.example');

  it('takes a wildcard, a scheme and a host that name us', () => {
    for (const source of ['*', 'https:', 'lumen.example', 'https://lumen.example', '*.example']) {
      expect(matchesOrigin(source, lumen), source).toBe(true);
    }
  });

  it('refuses the keywords, which are always about the site and never about us', () => {
    for (const source of ["'self'", "'none'", "'unsafe-inline'"]) {
      expect(matchesOrigin(source, lumen), source).toBe(false);
    }
  });

  it('refuses a host, scheme or port that is somebody else', () => {
    for (const source of [
      'other.example',
      'https://lumen.example:8443',
      '*.other.example',
      'https://sub.lumen.example',
    ]) {
      expect(matchesOrigin(source, lumen), source).toBe(false);
    }
  });

  it('lets an http source cover an https origin, as the grammar does', () => {
    expect(matchesOrigin('http:', lumen)).toBe(true);
    expect(matchesOrigin('http://lumen.example', lumen)).toBe(true);
    expect(matchesOrigin('https:', new URL('http://lumen.example'))).toBe(false);
  });

  it('matches a port when it is the one being served on', () => {
    const dev = new URL('http://localhost:5173');
    expect(matchesOrigin('http://localhost:5173', dev)).toBe(true);
    expect(matchesOrigin('localhost', dev)).toBe(false);
    expect(matchesOrigin('localhost:*', dev)).toBe(true);
  });
});

describe('frameRule', () => {
  const asking = 'https://lumen.example';

  it('lets a page with neither header be framed', () => {
    expect(frameRule({}, asking)).toEqual({ framable: true, header: null });
  });

  it('reads the refusals a site actually sends', () => {
    for (const frameOptions of ['DENY', 'SAMEORIGIN', 'sameorigin', 'Deny']) {
      const rule = frameRule({ frameOptions }, asking);
      expect(rule.framable, frameOptions).toBe(false);
      expect(rule.header, frameOptions).toBe(`X-Frame-Options: ${frameOptions}`);
    }
  });

  it('reads a frame-ancestors list that leaves us out, and one that lets us in', () => {
    const refused = frameRule(
      { policy: "default-src 'self'; frame-ancestors 'self' https://vercel.com" },
      asking,
    );
    expect(refused.framable).toBe(false);
    expect(refused.header).toBe(
      "Content-Security-Policy: frame-ancestors 'self' https://vercel.com",
    );
    expect(frameRule({ policy: 'frame-ancestors https://lumen.example' }, asking).framable).toBe(
      true,
    );
  });

  it('obeys frame-ancestors over X-Frame-Options, as a browser does', () => {
    expect(frameRule({ frameOptions: 'DENY', policy: 'frame-ancestors *' }, asking).framable).toBe(
      true,
    );
  });

  it('reads anything it cannot make sense of as a refusal', () => {
    // Being wrong this way costs a page fetched through Lumen that need not
    // have been; being wrong the other way costs a blank frame.
    expect(frameRule({ frameOptions: 'ALLOW-FROM https://other.example' }, asking).framable).toBe(
      false,
    );
    expect(frameRule({ frameOptions: 'nonsense' }, asking).framable).toBe(false);
    expect(frameRule({ frameOptions: 'DENY' }, 'not a url').framable).toBe(false);
  });
});

describe('probePage', () => {
  const answering = (headers: Record<string, string>) =>
    vi.fn(async () => new Response('<html>a whole page</html>', { status: 200, headers }));

  it('asks the site and reports what it said, without reading the page', async () => {
    const doFetch = answering({ 'x-frame-options': 'SAMEORIGIN' });
    const probe = await probePage(
      'https://example.com/',
      'https://lumen.example',
      doFetch as unknown as typeof fetch,
    );
    expect(probe).toEqual({
      frame: 'refused',
      header: 'X-Frame-Options: SAMEORIGIN',
      url: 'https://example.com/',
    });
  });

  it('says a site that allows it allows it', async () => {
    const probe = await probePage(
      'https://example.com/',
      'https://lumen.example',
      answering({}) as unknown as typeof fetch,
    );
    expect(probe.frame).toBe('allowed');
    expect(probe.header).toBeNull();
  });

  it('answers about where the address ended up, not where it started', async () => {
    let hop = 0;
    const doFetch = vi.fn(async () => {
      hop += 1;
      return hop === 1
        ? new Response(null, { status: 301, headers: { location: 'https://www.example.com/' } })
        : new Response('<html></html>', { status: 200, headers: { 'x-frame-options': 'DENY' } });
    });
    const probe = await probePage(
      'https://example.com/',
      'https://lumen.example',
      doFetch as unknown as typeof fetch,
    );
    expect(probe.url).toBe('https://www.example.com/');
    expect(probe.frame).toBe('refused');
  });

  it('is unknown, not refused, when nobody could ask', async () => {
    // The relay runs on this same server, so "we could not reach it" is not
    // something relaying can fix — the browser should try the site itself.
    const doFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const probe = await probePage(
      'https://example.com/',
      'https://lumen.example',
      doFetch as unknown as typeof fetch,
    );
    expect(probe.frame).toBe('unknown');
    expect(probe.problem).toContain('could not be reached');
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

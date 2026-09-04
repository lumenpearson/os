import { describe, expect, it } from 'vitest';
import {
  displayUrl,
  engineById,
  hostOf,
  internalPage,
  isInternalUrl,
  looksLikeUrl,
  normalizeInternalUrl,
  normalizeUrl,
  originOf,
  resolveInput,
  SEARCH_ENGINES,
  schemeOf,
  searchUrl,
  securityOf,
  tabInitial,
  titleFor,
} from './url';

const ddg = engineById('duckduckgo');

describe('engineById', () => {
  it('returns the engine with that id', () => {
    expect(engineById('google').name).toBe('Google');
  });

  it('falls back to the first engine for an unknown id', () => {
    expect(engineById('gopher')).toBe(SEARCH_ENGINES[0]);
  });
});

describe('searchUrl', () => {
  it('percent-encodes the query into the template', () => {
    expect(searchUrl('type theory', ddg)).toBe('https://duckduckgo.com/?q=type%20theory');
  });

  it('encodes characters that would break the query string', () => {
    expect(searchUrl('a&b=c', ddg)).toBe('https://duckduckgo.com/?q=a%26b%3Dc');
  });

  it('ignores surrounding whitespace', () => {
    expect(searchUrl('  cats  ', ddg)).toBe('https://duckduckgo.com/?q=cats');
  });
});

describe('internal pages', () => {
  it('recognises the lumen scheme in any case', () => {
    expect(isInternalUrl('lumen://start')).toBe(true);
    expect(isInternalUrl('LUMEN://Start')).toBe(true);
    expect(isInternalUrl('https://lumen.example')).toBe(false);
  });

  it('names the page', () => {
    expect(internalPage('lumen://history')).toBe('history');
    expect(internalPage('lumen://History/')).toBe('history');
    expect(internalPage('lumen://bookmarks')).toBe('bookmarks');
  });

  it('returns null for a page that does not exist', () => {
    expect(internalPage('lumen://downloads')).toBeNull();
    expect(internalPage('lumen://start/extra')).toBeNull();
    expect(internalPage('https://example.com')).toBeNull();
  });

  it('normalises spelling so two addresses compare equal', () => {
    expect(normalizeInternalUrl(' LUMEN://Settings/ ')).toBe('lumen://settings');
  });
});

describe('schemeOf / securityOf', () => {
  it('reads the scheme', () => {
    expect(schemeOf('https://example.com')).toBe('https');
    expect(schemeOf('http://example.com')).toBe('http');
    expect(schemeOf('lumen://start')).toBe('lumen');
    expect(schemeOf('ftp://example.com')).toBe('other');
  });

  it('maps https to secure, http to insecure and lumen to internal', () => {
    expect(securityOf('https://example.com')).toBe('secure');
    expect(securityOf('http://example.com')).toBe('insecure');
    expect(securityOf('lumen://start')).toBe('internal');
    expect(securityOf('ftp://example.com')).toBe('insecure');
  });
});

describe('originOf / hostOf', () => {
  it('gives the origin of a web address', () => {
    expect(originOf('https://example.com/a/b?q=1')).toBe('https://example.com');
    expect(originOf('http://example.com:8080/x')).toBe('http://example.com:8080');
  });

  it('gives the normalised address for an internal page', () => {
    expect(originOf('lumen://History')).toBe('lumen://history');
  });

  it('is empty for junk', () => {
    expect(originOf('not a url')).toBe('');
    expect(hostOf('not a url')).toBe('');
  });

  it('drops a leading www from the host', () => {
    expect(hostOf('https://www.example.com/x')).toBe('example.com');
    expect(hostOf('https://news.example.com')).toBe('news.example.com');
  });
});

describe('looksLikeUrl', () => {
  it('accepts anything with a scheme', () => {
    expect(looksLikeUrl('https://example.com')).toBe(true);
    expect(looksLikeUrl('lumen://start')).toBe(true);
  });

  it('accepts a bare host with a dot', () => {
    expect(looksLikeUrl('example.com')).toBe(true);
    expect(looksLikeUrl('example.com/docs')).toBe(true);
    expect(looksLikeUrl('sub.example.co.uk/path?q=1')).toBe(true);
  });

  it('accepts localhost with or without a port', () => {
    expect(looksLikeUrl('localhost')).toBe(true);
    expect(looksLikeUrl('localhost:5173/app')).toBe(true);
  });

  it('rejects bare words and phrases', () => {
    expect(looksLikeUrl('hello')).toBe(false);
    expect(looksLikeUrl('type theory')).toBe(false);
    expect(looksLikeUrl('example.com and more')).toBe(false);
    expect(looksLikeUrl('')).toBe(false);
  });

  it('rejects a trailing dot with nothing after it', () => {
    expect(looksLikeUrl('hello.')).toBe(false);
    expect(looksLikeUrl('.com')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('adds https to a bare host', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });

  it('keeps an explicit scheme', () => {
    expect(normalizeUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('returns null for something the URL parser rejects', () => {
    expect(normalizeUrl('http://')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
  });
});

describe('resolveInput', () => {
  it('returns null for blank input', () => {
    expect(resolveInput('   ', ddg)).toBeNull();
  });

  it('navigates to an internal page', () => {
    expect(resolveInput('lumen://Settings/', ddg)).toEqual({
      kind: 'internal',
      url: 'lumen://settings',
    });
  });

  it('navigates to an address', () => {
    expect(resolveInput('example.com/docs', ddg)).toEqual({
      kind: 'url',
      url: 'https://example.com/docs',
    });
  });

  it('searches for words', () => {
    expect(resolveInput('type theory', ddg)).toEqual({
      kind: 'search',
      url: 'https://duckduckgo.com/?q=type%20theory',
      query: 'type theory',
    });
  });

  it('searches when the input looks like a URL but cannot be parsed', () => {
    const resolved = resolveInput('http://', ddg);
    expect(resolved?.kind).toBe('search');
  });

  it('uses the engine it is given', () => {
    expect(resolveInput('cats', engineById('google'))?.url).toBe(
      'https://www.google.com/search?q=cats',
    );
  });
});

describe('displayUrl', () => {
  it('hides https and a bare trailing slash', () => {
    expect(displayUrl('https://example.com/')).toBe('example.com');
    expect(displayUrl('https://example.com/docs/')).toBe('example.com/docs');
  });

  it('keeps http visible because it is not encrypted', () => {
    expect(displayUrl('http://example.com/')).toBe('http://example.com');
  });

  it('keeps the query and the fragment', () => {
    expect(displayUrl('https://example.com/?q=1#top')).toBe('example.com/?q=1#top');
  });

  it('shows internal pages as themselves', () => {
    expect(displayUrl('lumen://Start')).toBe('lumen://start');
  });

  it('passes text it cannot parse straight through', () => {
    expect(displayUrl('not a url')).toBe('not a url');
  });
});

describe('titleFor', () => {
  it('names internal pages', () => {
    expect(titleFor('lumen://start')).toBe('New Tab');
    expect(titleFor('lumen://history')).toBe('History');
  });

  it('falls back to the host for a page we cannot read', () => {
    expect(titleFor('https://www.example.com/a/b')).toBe('example.com');
  });

  it('shows an unknown internal page as its address', () => {
    expect(titleFor('lumen://nowhere')).toBe('lumen://nowhere');
  });
});

describe('tabInitial', () => {
  it('takes the first letter of the host', () => {
    expect(tabInitial('https://example.com')).toBe('E');
    expect(tabInitial('https://www.example.com')).toBe('E');
  });

  it('takes the first digit of an address with no letters', () => {
    expect(tabInitial('http://127.0.0.1:8080')).toBe('1');
  });

  it('falls back to a question mark', () => {
    expect(tabInitial('lumen://start')).toBe('?');
  });
});

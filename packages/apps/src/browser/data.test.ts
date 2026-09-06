import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  type Bookmark,
  buildSuggestions,
  DEFAULT_BOOKMARKS,
  DEFAULT_DATA,
  findBookmark,
  nextId,
  normalizeData,
  removeBookmark,
  renameBookmark,
} from './data';
import type { Visit } from './history';
import { DEFAULT_SETTINGS } from './settings';
import { DEFAULT_ENGINE_ID, engineById, isInternalUrl, START_URL, schemeOf } from './url';

const ddg = engineById('duckduckgo');

function bookmark(id: string, title: string, url: string): Bookmark {
  return { id, title, url, addedAt: 0 };
}

function visit(id: string, url: string, title: string, visitedAt: number): Visit {
  return { id, url, title, visitedAt };
}

describe('DEFAULT_DATA', () => {
  it('opens on the new-tab page with the default settings and no history', () => {
    expect(DEFAULT_DATA.settings).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_DATA.settings.homepage).toBe(START_URL);
    expect(DEFAULT_DATA.history).toEqual([]);
  });

  it('starts with favourites, so the first run opens something', () => {
    expect(DEFAULT_DATA.bookmarks).toEqual([...DEFAULT_BOOKMARKS]);
    expect(DEFAULT_BOOKMARKS.length).toBeGreaterThan(1);
  });

  it('lists example.com and the built-in pages among them', () => {
    const urls = DEFAULT_BOOKMARKS.map((b) => b.url);
    expect(urls).toContain('https://example.com/');
    expect(urls.filter(isInternalUrl).length).toBeGreaterThan(0);
  });

  it('has nothing but https and lumen addresses, each named and unique', () => {
    for (const bookmark of DEFAULT_BOOKMARKS) {
      expect(['https', 'lumen']).toContain(schemeOf(bookmark.url));
      expect(bookmark.title).not.toBe('');
    }
    expect(new Set(DEFAULT_BOOKMARKS.map((b) => b.id)).size).toBe(DEFAULT_BOOKMARKS.length);
    expect(new Set(DEFAULT_BOOKMARKS.map((b) => b.url)).size).toBe(DEFAULT_BOOKMARKS.length);
  });
});

describe('nextId', () => {
  it('is unique and carries its prefix', () => {
    const a = nextId('bm');
    const b = nextId('bm');
    expect(a).not.toBe(b);
    expect(a.startsWith('bm-')).toBe(true);
  });
});

describe('bookmarks', () => {
  const list = [bookmark('1', 'Ay', 'https://a.example/')];

  it('adds to the end', () => {
    const next = addBookmark(list, bookmark('2', 'Bee', 'https://b.example/'));
    expect(next.map((b) => b.id)).toEqual(['1', '2']);
  });

  it('keeps the original entry for an address already bookmarked', () => {
    const next = addBookmark(list, bookmark('2', 'Other name', 'https://a.example/'));
    expect(next).toHaveLength(1);
    expect(next[0]?.title).toBe('Ay');
  });

  it('finds by address', () => {
    expect(findBookmark(list, 'https://a.example/')?.id).toBe('1');
    expect(findBookmark(list, 'https://z.example/')).toBeNull();
  });

  it('removes by id', () => {
    expect(removeBookmark(list, '1')).toEqual([]);
    expect(removeBookmark(list, 'nope')).toHaveLength(1);
  });

  it('renames and trims', () => {
    expect(renameBookmark(list, '1', '  Alpha  ')[0]?.title).toBe('Alpha');
  });

  it('refuses an empty name', () => {
    expect(renameBookmark(list, '1', '   ')[0]?.title).toBe('Ay');
  });

  it('never mutates the list it is given', () => {
    const original = [...list];
    addBookmark(list, bookmark('2', 'Bee', 'https://b.example/'));
    renameBookmark(list, '1', 'Alpha');
    removeBookmark(list, '1');
    expect(list).toEqual(original);
  });
});

describe('buildSuggestions', () => {
  const bookmarks = [
    bookmark('b1', 'Example Docs', 'https://example.com/docs'),
    bookmark('b2', 'Something else', 'https://other.test/'),
  ];
  const history = [
    visit('h1', 'https://example.com/blog', 'Example Blog', 3),
    visit('h2', 'https://example.com/blog', 'Example Blog', 2),
    visit('h3', 'https://elsewhere.test/', 'Elsewhere', 1),
  ];
  const source = { bookmarks, history, engine: ddg };

  it('offers the recent pages when the field is empty', () => {
    const rows = buildSuggestions('  ', source);
    expect(rows.map((r) => r.kind)).toEqual(['history', 'history']);
    expect(rows.map((r) => r.url)).toEqual(['https://example.com/blog', 'https://elsewhere.test/']);
  });

  it('leads with a search row for words', () => {
    const rows = buildSuggestions('type theory', source);
    expect(rows[0]?.kind).toBe('search');
    expect(rows[0]?.label).toContain('type theory');
    expect(rows[0]?.detail).toBe('DuckDuckGo');
    expect(rows[0]?.url).toBe('https://duckduckgo.com/?q=type%20theory');
  });

  it('leads with a go-to row for an address', () => {
    const rows = buildSuggestions('example.com/docs', source);
    expect(rows[0]?.kind).toBe('navigate');
    expect(rows[0]?.url).toBe('https://example.com/docs');
    expect(rows[0]?.label).toBe('example.com/docs');
  });

  it('lists matching bookmarks then matching history', () => {
    const rows = buildSuggestions('example', source);
    expect(rows.map((r) => r.kind)).toEqual(['search', 'bookmark', 'history']);
    expect(rows[1]?.url).toBe('https://example.com/docs');
    expect(rows[2]?.url).toBe('https://example.com/blog');
  });

  it('never repeats an address across the rows', () => {
    const rows = buildSuggestions('example.com/docs', source);
    const urls = rows.map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('collapses repeat visits to the same page', () => {
    const rows = buildSuggestions('blog', source);
    expect(rows.filter((r) => r.url === 'https://example.com/blog')).toHaveLength(1);
  });

  it('gives every row a unique key', () => {
    const rows = buildSuggestions('e', source);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('matches on the address as well as the title', () => {
    const rows = buildSuggestions('elsewhere', source);
    expect(rows.some((r) => r.url === 'https://elsewhere.test/')).toBe(true);
  });

  it('has only the search row when nothing matches', () => {
    const rows = buildSuggestions('zzz', source);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('search');
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      visit(`v${i}`, `https://site${i}.example/x`, `Site ${i}`, i),
    );
    const rows = buildSuggestions('site', { bookmarks: [], history: many, engine: ddg, limit: 4 });
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});

describe('normalizeData', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('{}')).toEqual(DEFAULT_DATA);
    expect(normalizeData(undefined)).toEqual(DEFAULT_DATA);
  });

  it('keeps well-formed entries as they are', () => {
    const stored = {
      bookmarks: [{ id: 'b1', title: 'Example', url: 'https://example.com/', addedAt: 5 }],
      history: [{ id: 'v1', title: 'Example', url: 'https://example.com/', visitedAt: 7 }],
      settings: { ...DEFAULT_SETTINGS, homepage: 'https://example.com/', searchEngine: 'google' },
    };
    expect(normalizeData(stored)).toEqual(stored);
  });

  it('drops entries without an address and names the rest after their host', () => {
    const data = normalizeData({
      bookmarks: [{ url: 'https://example.com/docs' }, { title: 'No address' }, 7],
      history: [{ url: 'https://example.com/' }, null],
    });
    expect(data.bookmarks).toEqual([
      { id: 'bookmark-0', title: 'example.com', url: 'https://example.com/docs', addedAt: 0 },
    ]);
    expect(data.history).toEqual([
      { id: 'visit-0', title: 'example.com', url: 'https://example.com/', visitedAt: 0 },
    ]);
  });

  it('gives the starting favourites to a file that has never held any', () => {
    expect(normalizeData({ history: [] }).bookmarks).toEqual([...DEFAULT_BOOKMARKS]);
  });

  it('leaves an empty bookmark list empty, because that was a choice', () => {
    expect(normalizeData({ bookmarks: [] }).bookmarks).toEqual([]);
  });

  it('reads settings from where an older file kept them', () => {
    const data = normalizeData({ homepage: 'https://old.example/', searchEngine: 'bing' });
    expect(data.settings.homepage).toBe('https://old.example/');
    expect(data.settings.searchEngine).toBe('bing');
  });

  it('prefers the settings section when the file has one', () => {
    const data = normalizeData({
      homepage: 'https://old.example/',
      settings: { homepage: 'https://new.example/' },
    });
    expect(data.settings.homepage).toBe('https://new.example/');
  });

  it('refuses a search engine it does not know', () => {
    expect(normalizeData({ searchEngine: 'askjeeves' }).settings.searchEngine).toBe(
      DEFAULT_ENGINE_ID,
    );
    expect(normalizeData({ searchEngine: 'bing' }).settings.searchEngine).toBe('bing');
  });

  it('keeps the visit log inside its limit', () => {
    const history = Array.from({ length: 600 }, (_, i) => ({
      id: `v${i}`,
      url: `https://example.com/${i}`,
      title: '',
      visitedAt: i,
    }));
    expect(normalizeData({ history }).history).toHaveLength(500);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildNote,
  countCharacters,
  countWords,
  DEFAULT_PREFS,
  deriveTitle,
  excerptAround,
  extractTags,
  fileNameForTitle,
  firstHeading,
  highlightParts,
  LIST_BREAKPOINT,
  LIST_WIDTH,
  LIST_WIDTH_COMPACT,
  type ListOptions,
  layoutFor,
  listNotes,
  listWidthFor,
  makeExcerpt,
  matchRanges,
  type Note,
  normalizePrefs,
  RAIL_BREAKPOINT,
  readingMinutes,
  retitle,
  scoreNote,
  tagCounts,
} from './notes';

const DAY = 86_400_000;

function note(
  text: string,
  extra: Partial<{ name: string; created: number; modified: number }> = {},
) {
  const name = extra.name ?? 'note.md';
  return buildNote({
    path: `/home/ada/Documents/Notes/${name}`,
    name,
    text,
    createdAt: extra.created ?? 1_000,
    modifiedAt: extra.modified ?? 2_000,
  });
}

describe('preferences', () => {
  it('falls back to the defaults for anything it does not recognise', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ sort: 'colour', view: 'zen', showTags: 'yes', lastPath: 7 })).toEqual(
      DEFAULT_PREFS,
    );
  });

  it('keeps values it does recognise', () => {
    expect(
      normalizePrefs({ sort: 'title', view: 'split', showTags: false, lastPath: '/a.md' }),
    ).toEqual({ sort: 'title', view: 'split', showTags: false, lastPath: '/a.md' });
  });
});

describe('title', () => {
  it('prefers the front-matter title', () => {
    expect(deriveTitle({ front: 'Declared', body: '# Heading', name: 'file.md' })).toBe('Declared');
  });

  it('falls back to the first heading, then to the file name', () => {
    expect(deriveTitle({ body: '\n\n## Heading\n\ntext', name: 'file.md' })).toBe('Heading');
    expect(deriveTitle({ body: 'no heading here', name: 'Shopping list.md' })).toBe(
      'Shopping list',
    );
    expect(deriveTitle({ body: '', name: 'read me.markdown' })).toBe('read me');
    expect(deriveTitle({ front: '   ', body: '', name: '.md' })).toBe('Untitled');
  });

  it('reads the heading through its markup and ignores one inside a fence', () => {
    expect(firstHeading('# A *fancy* `title`')).toBe('A fancy title');
    expect(firstHeading('```\n# not a heading\n```\n\n# Real\n')).toBe('Real');
    expect(firstHeading('#not a heading\n')).toBeNull();
    expect(firstHeading('#  \n\n# Real')).toBe('Real');
  });
});

describe('excerpt', () => {
  it('leaves out the heading the title came from', () => {
    expect(makeExcerpt('# Groceries\n\nMilk and bread.', 'Groceries')).toBe('Milk and bread.');
  });

  it('keeps a heading that is not the title', () => {
    expect(makeExcerpt('# Other\n\nBody.', 'Groceries')).toBe('Other Body.');
  });

  it('flattens markup and collapses whitespace', () => {
    expect(makeExcerpt('- **one**\n- two\n\n> three\n', 'T')).toBe('- one - two three');
  });

  it('truncates on a word boundary and marks the cut', () => {
    const long = `${'alpha '.repeat(40)}omega`;
    const short = makeExcerpt(long, 'T', 40);
    expect(short.endsWith('…')).toBe(true);
    expect(short.length).toBeLessThanOrEqual(41);
    expect(short).not.toContain('  ');
    expect(makeExcerpt('short one', 'T', 40)).toBe('short one');
  });
});

describe('tags', () => {
  it('collects tags in reading order without repeats', () => {
    expect(extractTags('#work and #home, then #work again')).toEqual(['work', 'home']);
  });

  it('treats a tag as the same tag whatever its case, keeping the first spelling', () => {
    expect(extractTags('#Work then #work')).toEqual(['Work']);
  });

  it('ignores hashes in code and headings', () => {
    expect(extractTags('# Heading\n\n`#nope`\n\n```\n#nope\n```\n\n#yes')).toEqual(['yes']);
  });

  it('counts tags across notes, most used first', () => {
    const notes = [note('#a #b'), note('#b'), note('#b #c'), note('no tags')];
    expect(tagCounts(notes)).toEqual([
      { tag: 'b', count: 3 },
      { tag: 'a', count: 1 },
      { tag: 'c', count: 1 },
    ]);
  });
});

describe('counting', () => {
  it('counts words by runs of non-space', () => {
    expect(countWords('  one   two\nthree\t four ')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });

  it('counts characters by code point, not by UTF-16 unit', () => {
    expect(countCharacters('abc')).toBe(3);
    expect(countCharacters('a\u{1F318}b')).toBe(3);
  });

  it('estimates reading time in whole minutes, never rounding a real note to zero', () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(220)).toBe(1);
    expect(readingMinutes(700)).toBe(3);
  });
});

describe('buildNote', () => {
  it('derives everything the list shows from one file', () => {
    const built = note(
      '---\ntitle: Groceries\npinned: yes\ncreated: 2026-01-02T00:00:00.000Z\n---\n# Shopping\n\nMilk #home and bread.\n',
      { name: 'shopping.md', created: 5, modified: 9 },
    );
    expect(built).toMatchObject({
      name: 'shopping.md',
      title: 'Groceries',
      excerpt: 'Shopping Milk #home and bread.',
      tags: ['home'],
      pinned: true,
      createdAt: Date.UTC(2026, 0, 2),
      modifiedAt: 9,
      bodyLine: 5,
      words: 6,
    });
    expect(built.body).toBe('# Shopping\n\nMilk #home and bread.\n');
  });

  it('falls back to the file stamps and the file name', () => {
    const built = note('just text\n', { name: 'Ideas.md', created: 5, modified: 9 });
    expect(built).toMatchObject({
      title: 'Ideas',
      pinned: false,
      createdAt: 5,
      modifiedAt: 9,
      tags: [],
      bodyLine: 0,
    });
  });
});

describe('search', () => {
  it('finds every case-insensitive occurrence', () => {
    expect(matchRanges('Alpha alpha ALPHA', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
    expect(matchRanges('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(matchRanges('text', '  ')).toEqual([]);
  });

  it('splits a string into matched and unmatched runs', () => {
    expect(highlightParts('a big cat', matchRanges('a big cat', 'big'))).toEqual([
      { text: 'a ', match: false },
      { text: 'big', match: true },
      { text: ' cat', match: false },
    ]);
    expect(highlightParts('abc', [])).toEqual([{ text: 'abc', match: false }]);
    expect(highlightParts('', [])).toEqual([]);
  });

  it('windows the excerpt around the first hit and moves the ranges with it', () => {
    const text = `${'x'.repeat(200)} needle ${'y'.repeat(200)}`;
    const { text: shown, ranges } = excerptAround(text, 'needle', 60);
    expect(shown.startsWith('…')).toBe(true);
    expect(shown.endsWith('…')).toBe(true);
    expect(ranges).toHaveLength(1);
    const range = ranges[0];
    if (!range) throw new Error('no range');
    expect(shown.slice(range.start, range.end)).toBe('needle');
  });

  it('falls back to the head of the text when there is no hit', () => {
    expect(excerptAround('a short note', 'zzz', 40)).toEqual({ text: 'a short note', ranges: [] });
  });

  it('weighs a title hit above a tag hit above a body hit', () => {
    const n = note('# Ledger\n\nA ledger of #ledger things, ledger-like.\n');
    const { score, matches } = scoreNote(n, 'ledger');
    expect(score).toBe(100 + 20 + 4);
    expect(matches).toBe(5);
    expect(scoreNote(n, 'absent')).toEqual({ score: 0, matches: 0 });
  });
});

describe('listNotes', () => {
  const options = (extra: Partial<ListOptions> = {}): ListOptions => ({
    sort: 'modified',
    ...extra,
  });
  const alpha = note('# Alpha\n\nfirst #work\n', { name: 'a.md', created: 3, modified: 30 });
  const beta = note('# Beta\n\nsecond #home\n', { name: 'b.md', created: 2, modified: 20 });
  const gamma = note('---\npinned: true\n---\n# Gamma\n\nthird #work\n', {
    name: 'c.md',
    created: 1,
    modified: 10,
  });
  const notes = [alpha, beta, gamma];
  const titles = (rows: ReturnType<typeof listNotes>) => rows.map((r) => r.note.title);

  it('puts pinned notes first, then the chosen order', () => {
    expect(titles(listNotes(notes, options()))).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(titles(listNotes(notes, options({ sort: 'created' })))).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ]);
    expect(titles(listNotes(notes, options({ sort: 'title' })))).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ]);
  });

  it('orders by the sort key once nothing is pinned', () => {
    const plain = [alpha, beta, note('# Delta\n', { name: 'd.md', created: 9, modified: 1 })];
    expect(titles(listNotes(plain, options()))).toEqual(['Alpha', 'Beta', 'Delta']);
    expect(titles(listNotes(plain, options({ sort: 'created' })))).toEqual([
      'Delta',
      'Alpha',
      'Beta',
    ]);
    expect(titles(listNotes(plain, options({ sort: 'title' })))).toEqual([
      'Alpha',
      'Beta',
      'Delta',
    ]);
  });

  it('filters by tag, whatever the case', () => {
    expect(titles(listNotes(notes, options({ tag: 'WORK' })))).toEqual(['Gamma', 'Alpha']);
    expect(listNotes(notes, options({ tag: 'nothing' }))).toEqual([]);
  });

  it('keeps only notes that match the query, best first', () => {
    const rows = listNotes(notes, options({ query: 'beta' }));
    expect(titles(rows)).toEqual(['Beta']);
    // The title of this note is its heading, so the word is hit twice: once in
    // the title and once in the body it was taken from.
    expect(rows[0]?.matches).toBe(2);
    expect(rows[0]?.titleRanges).toEqual([{ start: 0, end: 4 }]);
  });

  it('ranks a title match above a body match', () => {
    const rows = listNotes([alpha, note('# Zeta\n\nalpha in the body\n', { name: 'z.md' })], {
      sort: 'modified',
      query: 'alpha',
    });
    expect(titles(rows)).toEqual(['Alpha', 'Zeta']);
  });

  it('marks the query inside the excerpt it returns', () => {
    const row = listNotes(notes, options({ query: 'second' }))[0];
    if (!row) throw new Error('no row');
    const range = row.excerptRanges[0];
    if (!range) throw new Error('no range');
    expect(row.excerpt.slice(range.start, range.end)).toBe('second');
  });

  it('applies the tag filter and the query together', () => {
    expect(titles(listNotes(notes, options({ tag: 'work', query: 'third' })))).toEqual(['Gamma']);
  });
});

describe('writing back', () => {
  it('makes a safe file name from a title', () => {
    expect(fileNameForTitle('Shopping list')).toBe('Shopping list.md');
    expect(fileNameForTitle('Q1/2026: plan?')).toBe('Q1 2026 plan.md');
    expect(fileNameForTitle('   ')).toBe('Untitled.md');
    expect(fileNameForTitle('...')).toBe('Untitled.md');
    expect(fileNameForTitle('a'.repeat(100))).toBe(`${'a'.repeat(60)}.md`);
    expect(fileNameForTitle('a\u0000b\u001fc')).toBe('abc.md');
  });

  it('retitles by rewriting the heading the title came from', () => {
    expect(retitle('# Old\n\nbody\n', 'New')).toBe('# New\n\nbody\n');
    expect(retitle('## Old\n', 'New')).toBe('## New\n');
  });

  it('retitles through the front matter when that is where the title lives', () => {
    expect(retitle('---\ntitle: Old\n---\n# Heading\n', 'New')).toBe(
      '---\ntitle: New\n---\n# Heading\n',
    );
  });

  it('adds a front-matter title when there is no heading to rewrite', () => {
    expect(retitle('just text\n', 'New')).toBe('---\ntitle: New\n---\njust text\n');
  });

  it('ignores an empty title', () => {
    expect(retitle('# Old\n', '  ')).toBe('# Old\n');
  });

  it('leaves the rest of the front matter alone', () => {
    expect(retitle('---\ncolour: teal\n---\n# Old\n', 'New')).toBe(
      '---\ncolour: teal\n---\n# New\n',
    );
  });
});

describe('layout', () => {
  const at = (width: number, extra: Partial<Parameters<typeof layoutFor>[1]> = {}) =>
    layoutFor(width, { showRail: true, pane: 'list', hasSelection: true, ...extra });

  it('shows all three panes when there is room', () => {
    expect(at(RAIL_BREAKPOINT)).toEqual({ rail: true, list: true, editor: true, back: false });
    expect(at(1200, { showRail: false })).toEqual({
      rail: false,
      list: true,
      editor: true,
      back: false,
    });
  });

  it('folds the tag rail away first', () => {
    expect(at(RAIL_BREAKPOINT - 1)).toEqual({
      rail: false,
      list: true,
      editor: true,
      back: false,
    });
  });

  it('gives the editor the whole window below the list breakpoint, with a way back', () => {
    expect(at(LIST_BREAKPOINT - 1, { pane: 'editor' })).toEqual({
      rail: false,
      list: false,
      editor: true,
      back: true,
    });
    expect(at(LIST_BREAKPOINT - 1, { pane: 'list' })).toEqual({
      rail: false,
      list: true,
      editor: false,
      back: false,
    });
  });

  it('stays on the list when the editor pane has nothing to show', () => {
    expect(at(360, { pane: 'editor', hasSelection: false })).toEqual({
      rail: false,
      list: true,
      editor: false,
      back: false,
    });
  });

  it('treats an unmeasured window as roomy so the first paint is not a flicker', () => {
    expect(at(0)).toEqual({ rail: true, list: true, editor: true, back: false });
    expect(listWidthFor(0)).toBe(LIST_WIDTH);
  });

  it('narrows the list once the two panes have to share a small window', () => {
    expect(listWidthFor(1200)).toBe(LIST_WIDTH);
    expect(listWidthFor(639)).toBe(LIST_WIDTH_COMPACT);
    expect(LIST_WIDTH_COMPACT).toBeLessThan(LIST_WIDTH);
  });
});

describe('note fixtures used by the list', () => {
  it('keeps modified-time ordering stable for notes saved a day apart', () => {
    const older = note('# A\n', { name: 'a.md', modified: Date.now() - DAY });
    const newer = note('# B\n', { name: 'b.md', modified: Date.now() });
    const rows: Note[] = [older, newer];
    expect(listNotes(rows, { sort: 'modified' }).map((r) => r.note.title)).toEqual(['B', 'A']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatCreated,
  frontCreated,
  frontPinned,
  frontTitle,
  getEntry,
  parseDocument,
  serializeDocument,
  setEntry,
  withEntry,
} from './frontmatter';

const DOC = [
  '---',
  'title: Groceries',
  'pinned: true',
  'colour: teal',
  '---',
  '# Groceries',
  '',
].join('\n');

describe('parseDocument', () => {
  it('splits the block from the body and reports where the body starts', () => {
    const doc = parseDocument(DOC);
    expect(doc.front?.entries).toEqual([
      { kind: 'pair', key: 'title', value: 'Groceries' },
      { kind: 'pair', key: 'pinned', value: 'true' },
      { kind: 'pair', key: 'colour', value: 'teal' },
    ]);
    expect(doc.body).toBe('# Groceries\n');
    expect(doc.bodyLine).toBe(5);
  });

  it('treats a document with no block as all body', () => {
    const doc = parseDocument('# Just a note\n');
    expect(doc.front).toBeNull();
    expect(doc.body).toBe('# Just a note\n');
    expect(doc.bodyLine).toBe(0);
  });

  it('ignores an unterminated block', () => {
    const text = '---\ntitle: A\n\n# Body\n';
    expect(parseDocument(text)).toEqual({ front: null, body: text, bodyLine: 0 });
  });

  it('only reads a block that starts on the very first line', () => {
    const text = '\n---\ntitle: A\n---\n';
    expect(parseDocument(text).front).toBeNull();
  });

  it('reads an empty block', () => {
    const doc = parseDocument('---\n---\nbody');
    expect(doc.front?.entries).toEqual([]);
    expect(doc.body).toBe('body');
  });

  it('keeps a line it cannot read as a pair verbatim', () => {
    const doc = parseDocument('---\n# a comment\n\n  nested: no\nbroken line\n---\nbody');
    expect(doc.front?.entries).toEqual([
      { kind: 'raw', text: '# a comment' },
      { kind: 'raw', text: '' },
      { kind: 'raw', text: '  nested: no' },
      { kind: 'raw', text: 'broken line' },
    ]);
  });

  it('accepts a block written with CRLF line endings', () => {
    const doc = parseDocument('---\r\ntitle: A\r\n---\r\nbody');
    expect(getEntry(doc.front, 'title')).toBe('A');
  });

  it('unquotes a value and keeps the colon inside it', () => {
    const doc = parseDocument('---\ntitle: "Ship: day one"\nnote: \'as written\'\n---\n');
    expect(getEntry(doc.front, 'title')).toBe('Ship: day one');
    expect(getEntry(doc.front, 'note')).toBe('as written');
    expect(getEntry(parseDocument('---\ntitle: "a \\" b"\n---\n').front, 'title')).toBe('a " b');
  });
});

describe('serializeDocument', () => {
  it('round-trips a document unchanged', () => {
    const doc = parseDocument(DOC);
    expect(serializeDocument(doc.front, doc.body)).toBe(DOC);
  });

  it('round-trips comments, blanks and unreadable lines in their original order', () => {
    const text = '---\n# why\n\nweird\ntitle: A\n---\nbody\n';
    const doc = parseDocument(text);
    expect(serializeDocument(doc.front, doc.body)).toBe(text);
  });

  it('keeps a key it does not understand through an edit of another key', () => {
    const text = '---\ntitle: A\ncolour: teal\nrating: 5\n---\nbody\n';
    expect(withEntry(text, 'pinned', 'true')).toBe(
      '---\ntitle: A\ncolour: teal\nrating: 5\npinned: true\n---\nbody\n',
    );
  });

  it('writes no block at all when there are no entries', () => {
    expect(serializeDocument(null, '# Body\n')).toBe('# Body\n');
    expect(serializeDocument({ entries: [] }, '# Body\n')).toBe('# Body\n');
  });

  it('quotes a value that would not survive being read back', () => {
    const front = { entries: [] };
    expect(serializeDocument(setEntry(front, 'title', 'Ship: day one'), '')).toContain(
      'title: "Ship: day one"',
    );
    expect(serializeDocument(setEntry(front, 'title', ' padded '), '')).toContain(
      'title: " padded "',
    );
    expect(serializeDocument(setEntry(front, 'title', '#hash'), '')).toContain('title: "#hash"');
    expect(serializeDocument(setEntry(front, 'title', ''), '')).toContain('title: ""');
  });

  it('leaves an ISO stamp bare, so saving a note does not churn the line', () => {
    const text = '---\ncreated: 2026-01-02T03:04:05.000Z\n---\nbody\n';
    const doc = parseDocument(text);
    expect(serializeDocument(doc.front, doc.body)).toBe(text);
    expect(withEntry('body\n', 'created', formatCreated(Date.UTC(2026, 0, 2)))).toBe(
      '---\ncreated: 2026-01-02T00:00:00.000Z\n---\nbody\n',
    );
  });

  it('survives a value that needs quoting through parse and serialise', () => {
    const written = serializeDocument(setEntry(null, 'title', 'A: "B" \\ C'), 'body\n');
    expect(getEntry(parseDocument(written).front, 'title')).toBe('A: "B" \\ C');
  });
});

describe('entries', () => {
  it('reads a key, or undefined when it is absent', () => {
    const { front } = parseDocument(DOC);
    expect(getEntry(front, 'colour')).toBe('teal');
    expect(getEntry(front, 'missing')).toBeUndefined();
    expect(getEntry(null, 'title')).toBeUndefined();
  });

  it('replaces a key in place and appends a new one', () => {
    const { front } = parseDocument(DOC);
    expect(setEntry(front, 'title', 'Shopping').entries[0]).toEqual({
      kind: 'pair',
      key: 'title',
      value: 'Shopping',
    });
    expect(setEntry(front, 'rating', '5').entries.at(-1)).toEqual({
      kind: 'pair',
      key: 'rating',
      value: '5',
    });
  });

  it('removes a key with null and leaves the others in order', () => {
    const { front } = parseDocument(DOC);
    expect(setEntry(front, 'pinned', null).entries.map((e) => e.kind === 'pair' && e.key)).toEqual([
      'title',
      'colour',
    ]);
  });

  it('does not mutate the front matter it was given', () => {
    const { front } = parseDocument(DOC);
    const before = JSON.stringify(front);
    setEntry(front, 'title', 'Other');
    setEntry(front, 'title', null);
    expect(JSON.stringify(front)).toBe(before);
  });

  it('adds a block to a document that has none, and drops it again when empty', () => {
    const added = withEntry('# Body\n', 'title', 'A');
    expect(added).toBe('---\ntitle: A\n---\n# Body\n');
    expect(withEntry(added, 'title', null)).toBe('# Body\n');
  });
});

describe('typed reads', () => {
  it('takes a title only when there is a non-blank one', () => {
    expect(frontTitle(parseDocument(DOC).front)).toBe('Groceries');
    expect(frontTitle(parseDocument('---\ntitle:   \n---\n').front)).toBeUndefined();
    expect(frontTitle(null)).toBeUndefined();
  });

  it('reads the several spellings of a pinned note', () => {
    for (const value of ['true', 'yes', 'on', '1', 'TRUE', ' true ']) {
      expect(frontPinned(parseDocument(`---\npinned: ${value}\n---\n`).front)).toBe(true);
    }
    for (const value of ['false', 'no', '0', 'maybe', '']) {
      expect(frontPinned(parseDocument(`---\npinned: ${value}\n---\n`).front)).toBe(false);
    }
    expect(frontPinned(null)).toBe(false);
  });

  it('reads created as an ISO date or an epoch, and nothing else', () => {
    const at = Date.UTC(2026, 0, 2, 3, 4, 5);
    expect(frontCreated(parseDocument(`---\ncreated: ${formatCreated(at)}\n---\n`).front)).toBe(at);
    expect(frontCreated(parseDocument(`---\ncreated: ${at}\n---\n`).front)).toBe(at);
    expect(frontCreated(parseDocument('---\ncreated: whenever\n---\n').front)).toBeNull();
    expect(frontCreated(parseDocument('---\ntitle: A\n---\n').front)).toBeNull();
    expect(frontCreated(null)).toBeNull();
  });

  it('formats a stamp as an ISO string', () => {
    expect(formatCreated(Date.UTC(2026, 8, 4))).toBe('2026-09-04T00:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  isEmptyQuery,
  matchesQuery,
  parseQuery,
  searchesAllMailboxes,
  searchMessages,
} from './search';
import type { Message } from './store';

function message(patch: Partial<Message> & { id: string }): Message {
  return {
    mailbox: 'inbox',
    from: 'Ada Lovelace <ada@local>',
    to: ['You <you@local>'],
    cc: [],
    bcc: [],
    subject: 'The Analytical Engine',
    body: 'Notes on the engine and its cards.',
    date: 1_000,
    read: true,
    flagged: false,
    threadId: patch.id,
    attachments: [],
    inReplyTo: null,
    previousMailbox: null,
    ...patch,
  };
}

describe('parseQuery', () => {
  it('reads bare words', () => {
    expect(parseQuery('engine cards').terms).toEqual([
      { field: 'text', value: 'engine', phrase: false },
      { field: 'text', value: 'cards', phrase: false },
    ]);
  });

  it('keeps a quoted phrase together', () => {
    expect(parseQuery('"analytical engine"').terms).toEqual([
      { field: 'text', value: 'analytical engine', phrase: true },
    ]);
  });

  it('reads every prefix it knows', () => {
    const terms = parseQuery(
      'from:ada to:you subject:engine has:attachment is:unread in:archive',
    ).terms;
    expect(terms.map((t) => t.field)).toEqual(['from', 'to', 'subject', 'has', 'is', 'in']);
  });

  it('takes a quoted value after a prefix', () => {
    expect(parseQuery('subject:"the engine"').terms).toEqual([
      { field: 'subject', value: 'the engine', phrase: true },
    ]);
  });

  it('treats a prefix it does not know as a word, exactly as typed', () => {
    expect(parseQuery('label:urgent').terms).toEqual([
      { field: 'text', value: 'label:urgent', phrase: false },
    ]);
  });

  it('drops a prefix with nothing after it', () => {
    expect(parseQuery('from: engine').terms).toEqual([
      { field: 'text', value: 'engine', phrase: false },
    ]);
  });

  it('copes with an unclosed quote and runs of spaces', () => {
    expect(parseQuery('  "loose end').terms).toEqual([
      { field: 'text', value: 'loose end', phrase: true },
    ]);
    expect(parseQuery('   ').terms).toEqual([]);
  });

  it('is empty for an empty box', () => {
    expect(isEmptyQuery(parseQuery(''))).toBe(true);
    expect(isEmptyQuery(EMPTY_QUERY)).toBe(true);
  });
});

describe('matchesQuery', () => {
  const mail = message({
    id: 'a',
    read: false,
    flagged: true,
    attachments: [{ name: 'cards.txt', path: '/home/ada/cards.txt', size: 10 }],
  });

  it('matches nothing typed against everything', () => {
    expect(matchesQuery(mail, parseQuery(''))).toBe(true);
  });

  it('looks through the subject, body, people and attachment names', () => {
    for (const query of ['analytical', 'cards', 'lovelace', 'you@local', 'cards.txt']) {
      expect(matchesQuery(mail, parseQuery(query))).toBe(true);
    }
    expect(matchesQuery(mail, parseQuery('difference'))).toBe(false);
  });

  it('holds every term at once', () => {
    expect(matchesQuery(mail, parseQuery('engine cards'))).toBe(true);
    expect(matchesQuery(mail, parseQuery('engine abacus'))).toBe(false);
  });

  it('reads from: against the name and the address', () => {
    expect(matchesQuery(mail, parseQuery('from:lovelace'))).toBe(true);
    expect(matchesQuery(mail, parseQuery('from:ada@local'))).toBe(true);
    expect(matchesQuery(mail, parseQuery('from:grace'))).toBe(false);
  });

  it('reads to: across To, Cc and Bcc', () => {
    const copied = message({ id: 'b', cc: ['Grace <grace@local>'], bcc: ['ch@local'] });
    expect(matchesQuery(copied, parseQuery('to:grace'))).toBe(true);
    expect(matchesQuery(copied, parseQuery('to:ch@local'))).toBe(true);
  });

  it('answers has:attachment and refuses a has: it does not know', () => {
    expect(matchesQuery(mail, parseQuery('has:attachment'))).toBe(true);
    expect(matchesQuery(message({ id: 'b' }), parseQuery('has:attachment'))).toBe(false);
    expect(matchesQuery(mail, parseQuery('has:wings'))).toBe(false);
  });

  it('answers is:unread and is:flagged, and their opposites', () => {
    expect(matchesQuery(mail, parseQuery('is:unread'))).toBe(true);
    expect(matchesQuery(mail, parseQuery('is:read'))).toBe(false);
    expect(matchesQuery(mail, parseQuery('is:flagged'))).toBe(true);
    expect(matchesQuery(mail, parseQuery('is:unflagged'))).toBe(false);
    expect(matchesQuery(mail, parseQuery('is:starred'))).toBe(false);
  });

  it('matches in: on the mailbox id and on the name the sidebar shows', () => {
    const filed = message({ id: 'b', mailbox: 'folder:project-x' });
    const ctx = { mailboxLabel: (id: string) => (id === 'folder:project-x' ? 'Project X' : id) };
    expect(matchesQuery(filed, parseQuery('in:folder:project-x'), ctx)).toBe(true);
    expect(matchesQuery(filed, parseQuery('in:"project x"'), ctx)).toBe(true);
    expect(matchesQuery(filed, parseQuery('in:inbox'), ctx)).toBe(false);
  });

  it('ignores case on both sides', () => {
    expect(matchesQuery(mail, parseQuery('ANALYTICAL'))).toBe(true);
    expect(matchesQuery(mail, parseQuery('SUBJECT:Engine'))).toBe(true);
  });
});

describe('searchMessages', () => {
  const messages = [
    message({ id: 'a', subject: 'The Analytical Engine' }),
    message({ id: 'b', subject: 'Lunch?', body: 'Tuesday?', read: false }),
  ];

  it('returns everything for an empty query, filtered otherwise', () => {
    expect(searchMessages(messages, '')).toHaveLength(2);
    expect(searchMessages(messages, 'is:unread').map((m) => m.id)).toEqual(['b']);
  });

  it('takes a query that is already parsed', () => {
    expect(searchMessages(messages, parseQuery('engine')).map((m) => m.id)).toEqual(['a']);
  });

  it('knows when a query reaches past the open mailbox', () => {
    expect(searchesAllMailboxes(parseQuery('in:sent'))).toBe(true);
    expect(searchesAllMailboxes(parseQuery('engine'))).toBe(false);
  });
});

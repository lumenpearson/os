/**
 * The search box. A query is a list of terms, all of which must match:
 * bare words, quoted phrases, and the prefixes `from:`, `to:`, `subject:`,
 * `has:attachment`, `is:unread`, `is:flagged` and `in:<mailbox>`.
 *
 * A prefix this app does not know is not an error — `label:urgent` is a word
 * to look for, exactly as typed.
 */

import { displayAddress } from './format';
import type { Message } from './store';

export const SEARCH_FIELDS = ['from', 'to', 'subject', 'has', 'is', 'in'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface Term {
  field: SearchField | 'text';
  /** Lower-cased; what the matcher compares against. */
  value: string;
  /** The value arrived inside quotes. */
  phrase: boolean;
}

export interface Query {
  terms: Term[];
  /** The text as typed, for the empty state to quote back. */
  raw: string;
}

export const EMPTY_QUERY: Query = { terms: [], raw: '' };

const PREFIX = /^([a-z]+):/i;

function isField(name: string): name is SearchField {
  return (SEARCH_FIELDS as readonly string[]).includes(name);
}

/** Read a quoted or bare value starting at `i`; returns the value and the end. */
function readValue(input: string, i: number): { value: string; end: number; phrase: boolean } {
  if (input[i] === '"') {
    const close = input.indexOf('"', i + 1);
    if (close === -1) return { value: input.slice(i + 1), end: input.length, phrase: true };
    return { value: input.slice(i + 1, close), end: close + 1, phrase: true };
  }
  let end = i;
  while (end < input.length && !/\s/.test(input[end] ?? '')) end += 1;
  return { value: input.slice(i, end), end, phrase: false };
}

export function parseQuery(input: string): Query {
  const terms: Term[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/.test(input[i] ?? '')) {
      i += 1;
      continue;
    }
    const start = i;
    const match = PREFIX.exec(input.slice(i));
    const name = match?.[1]?.toLowerCase() ?? '';
    if (match && isField(name)) {
      const read = readValue(input, i + match[0].length);
      i = read.end;
      // `from:` with nothing after it filters nothing; drop it.
      if (read.value.trim() !== '') {
        terms.push({ field: name, value: read.value.trim().toLowerCase(), phrase: read.phrase });
      }
      continue;
    }
    const read = readValue(input, start);
    i = read.end;
    if (read.value.trim() !== '') {
      terms.push({ field: 'text', value: read.value.trim().toLowerCase(), phrase: read.phrase });
    }
  }
  return { terms, raw: input };
}

export function isEmptyQuery(query: Query): boolean {
  return query.terms.length === 0;
}

export interface MatchContext {
  /** Turns a mailbox id into the name the sidebar shows, for `in:`. */
  mailboxLabel?: (id: string) => string;
}

const has = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle);

function matchesAddresses(list: readonly string[], value: string): boolean {
  return list.some((address) => has(address, value) || has(displayAddress(address), value));
}

function matchesTerm(message: Message, term: Term, ctx: MatchContext): boolean {
  switch (term.field) {
    case 'from':
      return matchesAddresses([message.from], term.value);
    case 'to':
      return matchesAddresses([...message.to, ...message.cc, ...message.bcc], term.value);
    case 'subject':
      return has(message.subject, term.value);
    case 'has':
      return (
        (term.value === 'attachment' || term.value === 'attachments' || term.value === 'file') &&
        message.attachments.length > 0
      );
    case 'is':
      switch (term.value) {
        case 'unread':
          return !message.read;
        case 'read':
          return message.read;
        case 'flagged':
          return message.flagged;
        case 'unflagged':
          return !message.flagged;
        default:
          return false;
      }
    case 'in': {
      const label = ctx.mailboxLabel?.(message.mailbox) ?? '';
      return message.mailbox.toLowerCase() === term.value || label.toLowerCase() === term.value;
    }
    default:
      return (
        has(message.subject, term.value) ||
        has(message.body, term.value) ||
        matchesAddresses(
          [message.from, ...message.to, ...message.cc, ...message.bcc],
          term.value,
        ) ||
        message.attachments.some((a) => has(a.name, term.value))
      );
  }
}

/** Every term has to match; an empty query matches everything. */
export function matchesQuery(message: Message, query: Query, ctx: MatchContext = {}): boolean {
  return query.terms.every((term) => matchesTerm(message, term, ctx));
}

export function searchMessages(
  messages: readonly Message[],
  query: Query | string,
  ctx: MatchContext = {},
): Message[] {
  const parsed = typeof query === 'string' ? parseQuery(query) : query;
  if (isEmptyQuery(parsed)) return [...messages];
  return messages.filter((message) => matchesQuery(message, parsed, ctx));
}

/**
 * Whether the query reaches outside the open mailbox. `in:` names a mailbox,
 * so the search runs over everything; without it it stays where the user is.
 */
export function searchesAllMailboxes(query: Query): boolean {
  return query.terms.some((term) => term.field === 'in');
}

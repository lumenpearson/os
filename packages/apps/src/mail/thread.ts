/**
 * Conversations. Two messages belong to the same one when they carry the same
 * thread id, or when their subjects match once every Re:/Fwd: prefix is
 * stripped AND their participants overlap — a matching subject alone would
 * join two unrelated "Lunch?" messages between strangers.
 *
 * Grouping is transitive: if A joins B and B joins C, all three are one
 * conversation, which is what a reply chain that drops a recipient looks like.
 */

import { addressEmail, displayAddress, formatAddressList } from './format';
import type { Message, SortKey } from './store';

/** Re:, RE:, Fwd:, FW: … in any run, with or without spaces. */
const PREFIX = /^\s*(?:re|fwd|fw)\s*(?:\[\d+\])?\s*:\s*/i;

/** "Re: Fwd: Re: Lunch?" → "Lunch?" */
export function stripSubjectPrefixes(subject: string): string {
  let out = subject;
  let previous: string;
  do {
    previous = out;
    out = out.replace(PREFIX, '');
  } while (out !== previous);
  return out.trim();
}

/** The comparable form of a subject: prefixes gone, case and spacing flattened. */
export function normalizeSubject(subject: string): string {
  return stripSubjectPrefixes(subject).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Every address on a message, as bare lower-case addresses. */
export function participantsOf(message: Message): Set<string> {
  const out = new Set<string>();
  for (const raw of [message.from, ...message.to, ...message.cc, ...message.bcc]) {
    const email = addressEmail(raw).toLowerCase();
    if (email !== '') out.add(email);
  }
  return out;
}

function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/** Whether two messages read as the same conversation. */
export function sameThread(a: Message, b: Message): boolean {
  if (a.threadId !== '' && a.threadId === b.threadId) return true;
  const subject = normalizeSubject(a.subject);
  if (subject === '' || subject !== normalizeSubject(b.subject)) return false;
  return overlaps(participantsOf(a), participantsOf(b));
}

export interface Thread {
  /** The thread id of its earliest message; stable across regrouping. */
  id: string;
  /** The earliest message's subject, prefixes stripped. */
  subject: string;
  /** Oldest first — the order the conversation happened in. */
  messages: Message[];
  /** The newest message; the one the list row shows. */
  latest: Message;
  unread: number;
  flagged: boolean;
  attachments: number;
}

/** Newest first, ties broken by id so the order never wobbles. */
function byNewest(a: Message, b: Message): number {
  return b.date - a.date || b.id.localeCompare(a.id);
}

function byOldest(a: Message, b: Message): number {
  return a.date - b.date || a.id.localeCompare(b.id);
}

class Groups {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while ((this.parent[root] ?? root) !== root) root = this.parent[root] ?? root;
    let walk = i;
    while ((this.parent[walk] ?? walk) !== walk) {
      const next = this.parent[walk] ?? walk;
      this.parent[walk] = root;
      walk = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}

/**
 * Group messages into conversations, newest conversation first. Only the
 * messages handed in are considered, so a mailbox's threads stop at its edge.
 */
export function groupThreads(messages: readonly Message[]): Thread[] {
  const list = [...messages].sort(byOldest);
  const groups = new Groups(list.length);
  const byThreadId = new Map<string, number>();
  const bySubject = new Map<string, number[]>();
  const participants = list.map(participantsOf);

  list.forEach((message, index) => {
    const seen = byThreadId.get(message.threadId);
    if (message.threadId !== '') {
      if (seen === undefined) byThreadId.set(message.threadId, index);
      else groups.union(seen, index);
    }
    const subject = normalizeSubject(message.subject);
    if (subject === '') return;
    const bucket = bySubject.get(subject);
    if (!bucket) {
      bySubject.set(subject, [index]);
      return;
    }
    const mine = participants[index];
    for (const other of bucket) {
      const theirs = participants[other];
      if (mine && theirs && overlaps(mine, theirs)) groups.union(other, index);
    }
    bucket.push(index);
  });

  const buckets = new Map<number, Message[]>();
  list.forEach((message, index) => {
    const root = groups.find(index);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(message);
    else buckets.set(root, [message]);
  });

  const threads: Thread[] = [];
  for (const bucket of buckets.values()) {
    const ordered = [...bucket].sort(byOldest);
    const first = ordered[0];
    const latest = [...ordered].sort(byNewest)[0];
    if (!first || !latest) continue;
    threads.push({
      id: first.threadId || first.id,
      subject: stripSubjectPrefixes(first.subject),
      messages: ordered,
      latest,
      unread: ordered.filter((m) => !m.read).length,
      flagged: ordered.some((m) => m.flagged),
      attachments: ordered.reduce((sum, m) => sum + m.attachments.length, 0),
    });
  }
  return threads.sort((a, b) => byNewest(a.latest, b.latest));
}

/**
 * Re-order conversations for the View > Sort By choice. Date is the order
 * `groupThreads` already produced; the other two fall back to it for ties, so
 * two messages with the same subject still read newest first.
 */
export function sortThreads(
  threads: readonly Thread[],
  sort: SortKey,
  byRecipient = false,
): Thread[] {
  if (sort === 'date') return [...threads];
  const person = (thread: Thread) =>
    byRecipient ? formatAddressList(thread.latest.to) : displayAddress(thread.latest.from);
  return [...threads].sort((a, b) => {
    const key =
      sort === 'from' ? person(a).localeCompare(person(b)) : a.subject.localeCompare(b.subject);
    return key !== 0 ? key : byNewest(a.latest, b.latest);
  });
}

/** The thread a message belongs to, or null when it is not in the list. */
export function threadOf(threads: readonly Thread[], id: string | null): Thread | null {
  if (id === null) return null;
  return threads.find((t) => t.messages.some((m) => m.id === id)) ?? null;
}

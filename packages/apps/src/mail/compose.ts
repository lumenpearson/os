/**
 * Composing: the draft the sheet edits, what Reply, Reply All and Forward
 * put in it, and the message that comes back out when it is saved or sent.
 *
 * Subject prefixes never stack — every Re:/Fwd: is stripped before one is
 * added, so a long chain stays "Re: Lunch?" rather than "Re: Re: Re: Lunch?".
 */

import {
  displayAddress,
  type FormatOptions,
  formatAttribution,
  formatFullStamp,
  sameAddress,
} from './format';
import type { Attachment, Message } from './store';
import { stripSubjectPrefixes } from './thread';

export interface Draft {
  /** The id the message will be written under; fixed when the sheet opens. */
  id: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  inReplyTo: string | null;
  threadId: string;
  /** When the draft was started; the sent message keeps its own stamp. */
  date: number;
  /** A copy already sits in Drafts, so closing without saving leaves it there. */
  saved: boolean;
}

// ── addresses in a field ──────────────────────────────────────────────────

/**
 * Split a recipient field. Commas and semicolons separate, except inside
 * quotes or angle brackets: `"Lovelace, Ada" <ada@local>` is one person.
 */
export function parseAddresses(input: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  let angled = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    else if (char === '<') angled = true;
    else if (char === '>') angled = false;
    if ((char === ',' || char === ';') && !quoted && !angled) {
      if (current.trim() !== '') out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

export function formatAddresses(list: readonly string[]): string {
  return list.join(', ');
}

function without(list: readonly string[], exclude: readonly string[]): string[] {
  const out: string[] = [];
  for (const address of list) {
    if (exclude.some((other) => sameAddress(address, other))) continue;
    if (out.some((other) => sameAddress(address, other))) continue;
    out.push(address);
  }
  return out;
}

// ── subjects ──────────────────────────────────────────────────────────────

export function replySubject(subject: string): string {
  const stem = stripSubjectPrefixes(subject);
  return stem === '' ? 'Re:' : `Re: ${stem}`;
}

export function forwardSubject(subject: string): string {
  const stem = stripSubjectPrefixes(subject);
  return stem === '' ? 'Fwd:' : `Fwd: ${stem}`;
}

// ── bodies ────────────────────────────────────────────────────────────────

/** The message quoted under an attribution line, the way a reply carries it. */
export function quoteBody(message: Message, o: FormatOptions): string {
  const quoted = message.body
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
  return `\n\n${formatAttribution(message.date, message.from, o)}\n${quoted}\n`;
}

/** The header block a forwarded message travels under. */
export function forwardBody(message: Message, o: FormatOptions): string {
  const header = [
    '---------- Forwarded message ----------',
    `From: ${message.from}`,
    `Date: ${formatFullStamp(message.date, o)}`,
    `Subject: ${message.subject}`,
    `To: ${formatAddresses(message.to)}`,
  ].join('\n');
  return `\n\n${header}\n\n${message.body}\n`;
}

// ── drafts ────────────────────────────────────────────────────────────────

export function emptyDraft(id: string, now: number): Draft {
  return {
    id,
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [],
    inReplyTo: null,
    threadId: id,
    date: now,
    saved: false,
  };
}

/** Reopen a message sitting in Drafts. */
export function draftFromMessage(message: Message): Draft {
  return {
    id: message.id,
    to: formatAddresses(message.to),
    cc: formatAddresses(message.cc),
    bcc: formatAddresses(message.bcc),
    subject: message.subject,
    body: message.body,
    attachments: message.attachments.map((a) => ({ ...a })),
    inReplyTo: message.inReplyTo,
    threadId: message.threadId || message.id,
    date: message.date,
    saved: true,
  };
}

/**
 * Who a reply goes to. Answering your own sent message writes to the people
 * you wrote to, not to yourself; Reply All adds everyone else it was addressed
 * to, minus you.
 */
export function replyRecipients(
  message: Message,
  me: string,
  all: boolean,
): { to: string[]; cc: string[] } {
  const mine = sameAddress(message.from, me);
  const to = mine ? without(message.to, [me]) : [message.from];
  if (to.length === 0) to.push(message.from);
  if (!all) return { to, cc: [] };
  const cc = without([...message.to, ...message.cc], [me, ...to]);
  return { to, cc };
}

export function replyDraft(
  message: Message,
  me: string,
  options: { all: boolean; id: string; now: number; o: FormatOptions },
): Draft {
  const { to, cc } = replyRecipients(message, me, options.all);
  return {
    id: options.id,
    to: formatAddresses(to),
    cc: formatAddresses(cc),
    bcc: '',
    subject: replySubject(message.subject),
    body: quoteBody(message, options.o),
    attachments: [],
    inReplyTo: message.id,
    threadId: message.threadId || message.id,
    date: options.now,
    saved: false,
  };
}

export function forwardDraft(
  message: Message,
  options: { id: string; now: number; o: FormatOptions },
): Draft {
  return {
    id: options.id,
    to: '',
    cc: '',
    bcc: '',
    subject: forwardSubject(message.subject),
    // A forward starts a conversation with someone new, so it is its own thread.
    body: forwardBody(message, options.o),
    attachments: message.attachments.map((a) => ({ ...a })),
    inReplyTo: null,
    threadId: options.id,
    date: options.now,
    saved: false,
  };
}

/** Nothing typed and nothing attached: not worth keeping as a draft. */
export function draftIsBlank(draft: Draft): boolean {
  return (
    draft.to.trim() === '' &&
    draft.cc.trim() === '' &&
    draft.bcc.trim() === '' &&
    draft.subject.trim() === '' &&
    draft.body.trim() === '' &&
    draft.attachments.length === 0
  );
}

/** A draft has to be addressed before it can be delivered anywhere. */
export function canSend(draft: Draft): boolean {
  return parseAddresses(draft.to).length > 0;
}

export interface DraftMessageOptions {
  /** The signed-in user, as `Name <user@local>`. */
  from: string;
  mailbox: 'drafts' | 'sent';
  now: number;
}

/** The record a draft becomes on its way into the mailbox. */
export function draftToMessage(draft: Draft, options: DraftMessageOptions): Message {
  return {
    id: draft.id,
    mailbox: options.mailbox,
    from: options.from,
    to: parseAddresses(draft.to),
    cc: parseAddresses(draft.cc),
    bcc: parseAddresses(draft.bcc),
    subject: draft.subject.trim(),
    body: draft.body,
    date: options.now,
    read: true,
    flagged: false,
    threadId: draft.threadId || draft.id,
    attachments: draft.attachments.map((a) => ({ ...a })),
    inReplyTo: draft.inReplyTo,
    previousMailbox: null,
  };
}

/** The line the reading pane prints for an unaddressed or untitled message. */
export function displaySubject(subject: string): string {
  return subject.trim() === '' ? 'No subject' : subject;
}

export function displaySender(message: Message): string {
  return displayAddress(message.from) || 'Unknown sender';
}

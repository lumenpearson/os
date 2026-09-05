import { describe, expect, it } from 'vitest';
import {
  canSend,
  type Draft,
  draftFromMessage,
  draftIsBlank,
  draftToMessage,
  emptyDraft,
  forwardBody,
  forwardDraft,
  forwardSubject,
  parseAddresses,
  quoteBody,
  replyDraft,
  replyRecipients,
  replySubject,
} from './compose';
import type { FormatOptions } from './format';
import type { Message } from './store';

const o: FormatOptions = { locale: 'en-GB', hour12: false, timeZone: 'UTC' };
const DATE = Date.UTC(2026, 8, 4, 9, 41);
const ME = 'You <you@local>';

function message(patch: Partial<Message> & { id: string }): Message {
  return {
    mailbox: 'inbox',
    from: 'Ada Lovelace <ada@local>',
    to: [ME, 'Grace <grace@local>'],
    cc: ['Charles <charles@local>'],
    bcc: [],
    subject: 'Lunch?',
    body: 'Are you free on Tuesday?',
    date: DATE,
    read: true,
    flagged: false,
    threadId: patch.id,
    attachments: [],
    inReplyTo: null,
    previousMailbox: null,
    ...patch,
  };
}

describe('parseAddresses', () => {
  it('splits on commas and semicolons', () => {
    expect(parseAddresses('ada@local, grace@local; charles@local')).toEqual([
      'ada@local',
      'grace@local',
      'charles@local',
    ]);
  });

  it('keeps a comma inside quotes or angle brackets with its address', () => {
    expect(parseAddresses('"Lovelace, Ada" <ada@local>, grace@local')).toEqual([
      '"Lovelace, Ada" <ada@local>',
      'grace@local',
    ]);
  });

  it('drops empty entries and trims the rest', () => {
    expect(parseAddresses('  ada@local ,, ')).toEqual(['ada@local']);
    expect(parseAddresses('')).toEqual([]);
  });
});

describe('subjects', () => {
  it('adds one prefix and never stacks it', () => {
    expect(replySubject('Lunch?')).toBe('Re: Lunch?');
    expect(replySubject('Re: Lunch?')).toBe('Re: Lunch?');
    expect(replySubject('Fwd: Re: Lunch?')).toBe('Re: Lunch?');
    expect(forwardSubject('Re: Lunch?')).toBe('Fwd: Lunch?');
    expect(forwardSubject('Fwd: Fwd: Lunch?')).toBe('Fwd: Lunch?');
  });

  it('copes with a message that has no subject', () => {
    expect(replySubject('')).toBe('Re:');
    expect(forwardSubject('   ')).toBe('Fwd:');
  });
});

describe('quoting', () => {
  it('puts an attribution line above the quoted body', () => {
    const quoted = quoteBody(message({ id: 'a', body: 'One\n\nTwo' }), o);
    expect(quoted.split('\n')).toEqual([
      '',
      '',
      'On 4 September 2026 at 09:41, Ada Lovelace wrote:',
      '> One',
      '>',
      '> Two',
      '',
    ]);
  });

  it('starts a forward with a header block, not with quote marks', () => {
    const body = forwardBody(message({ id: 'a' }), o);
    expect(body).toContain('---------- Forwarded message ----------');
    expect(body).toContain('From: Ada Lovelace <ada@local>');
    expect(body).toContain('Subject: Lunch?');
    expect(body).toContain('Are you free on Tuesday?');
    expect(body).not.toContain('> Are you free');
  });
});

describe('replying', () => {
  it('answers the sender alone', () => {
    expect(replyRecipients(message({ id: 'a' }), ME, false)).toEqual({
      to: ['Ada Lovelace <ada@local>'],
      cc: [],
    });
  });

  it('answers everyone else too, and never copies you in', () => {
    const { to, cc } = replyRecipients(message({ id: 'a' }), ME, true);
    expect(to).toEqual(['Ada Lovelace <ada@local>']);
    expect(cc).toEqual(['Grace <grace@local>', 'Charles <charles@local>']);
    expect(cc.join()).not.toContain('you@local');
  });

  it('answering your own sent message writes to the people you wrote to', () => {
    const mine = message({ id: 'a', from: ME, to: ['Ada <ada@local>'], cc: [] });
    expect(replyRecipients(mine, ME, false).to).toEqual(['Ada <ada@local>']);
  });

  it('falls back to the sender when a note to yourself has nobody else on it', () => {
    const toSelf = message({ id: 'a', from: ME, to: [ME], cc: [] });
    expect(replyRecipients(toSelf, ME, false).to).toEqual([ME]);
  });

  it('builds the draft with the subject, the quote and the thread it belongs to', () => {
    const draft = replyDraft(message({ id: 'a', threadId: 't' }), ME, {
      all: false,
      id: 'd1',
      now: 2_000,
      o,
    });
    expect(draft.subject).toBe('Re: Lunch?');
    expect(draft.inReplyTo).toBe('a');
    expect(draft.threadId).toBe('t');
    expect(draft.body).toContain('> Are you free on Tuesday?');
    expect(draft.saved).toBe(false);
  });

  it('a reply carries no attachments; a forward carries them all', () => {
    const file = { name: 'notes.txt', path: '/home/ada/notes.txt', size: 12 };
    const original = message({ id: 'a', attachments: [file] });
    expect(replyDraft(original, ME, { all: true, id: 'd1', now: 1, o }).attachments).toEqual([]);
    const forwarded = forwardDraft(original, { id: 'd2', now: 1, o });
    expect(forwarded.attachments).toEqual([file]);
    expect(forwarded.attachments[0]).not.toBe(file);
  });

  it('a forward starts its own conversation and addresses nobody yet', () => {
    const forwarded = forwardDraft(message({ id: 'a', threadId: 't' }), { id: 'd2', now: 1, o });
    expect(forwarded.threadId).toBe('d2');
    expect(forwarded.to).toBe('');
    expect(forwarded.inReplyTo).toBeNull();
  });
});

describe('drafts', () => {
  it('round-trips a saved draft through the sheet', () => {
    const saved = message({
      id: 'd1',
      mailbox: 'drafts',
      from: ME,
      to: ['ada@local', 'grace@local'],
      cc: [],
      subject: 'Half written',
    });
    const draft = draftFromMessage(saved);
    expect(draft.to).toBe('ada@local, grace@local');
    expect(draft.saved).toBe(true);
    const back = draftToMessage(draft, { from: ME, mailbox: 'drafts', now: 5_000 });
    expect(back.to).toEqual(['ada@local', 'grace@local']);
    expect(back.id).toBe('d1');
    expect(back.date).toBe(5_000);
  });

  it('knows a blank draft from one worth keeping', () => {
    const blank = emptyDraft('d1', 0);
    expect(draftIsBlank(blank)).toBe(true);
    expect(draftIsBlank({ ...blank, body: '  ' })).toBe(true);
    expect(draftIsBlank({ ...blank, subject: 'Hello' })).toBe(false);
    expect(
      draftIsBlank({
        ...blank,
        attachments: [{ name: 'a.txt', path: '/home/a/a.txt', size: 1 }],
      }),
    ).toBe(false);
  });

  it('will not send until somebody is addressed', () => {
    const draft: Draft = { ...emptyDraft('d1', 0), subject: 'Hello' };
    expect(canSend(draft)).toBe(false);
    expect(canSend({ ...draft, to: '  ' })).toBe(false);
    expect(canSend({ ...draft, to: 'ada@local' })).toBe(true);
  });

  it('trims the subject and stamps the message on its way out', () => {
    const draft: Draft = { ...emptyDraft('d1', 0), to: 'ada@local', subject: '  Hello  ' };
    const sent = draftToMessage(draft, { from: ME, mailbox: 'sent', now: 9_000 });
    expect(sent.subject).toBe('Hello');
    expect(sent.mailbox).toBe('sent');
    expect(sent.from).toBe(ME);
    expect(sent.read).toBe(true);
    expect(sent.threadId).toBe('d1');
  });
});

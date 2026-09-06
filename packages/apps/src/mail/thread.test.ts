import { describe, expect, it } from 'vitest';
import type { Message } from './store';
import {
  groupThreads,
  normalizeSubject,
  participantsOf,
  sameThread,
  sortThreads,
  stripSubjectPrefixes,
  threadOf,
} from './thread';

function message(patch: Partial<Message> & { id: string }): Message {
  return {
    mailbox: 'inbox',
    from: 'Ada <ada@local>',
    to: ['You <you@local>'],
    cc: [],
    bcc: [],
    subject: 'Lunch?',
    body: '',
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

describe('stripSubjectPrefixes', () => {
  it('takes off a run of reply and forward prefixes in any case', () => {
    expect(stripSubjectPrefixes('Re: Fwd: RE: FW: Lunch?')).toBe('Lunch?');
    expect(stripSubjectPrefixes('re:re:re: Lunch?')).toBe('Lunch?');
    expect(stripSubjectPrefixes('Re[2]: Lunch?')).toBe('Lunch?');
  });

  it('leaves a subject that only looks like one alone', () => {
    expect(stripSubjectPrefixes('Rebuild the index')).toBe('Rebuild the index');
    expect(stripSubjectPrefixes('Fwd Lunch')).toBe('Fwd Lunch');
  });

  it('is empty when the subject is nothing but prefixes', () => {
    expect(stripSubjectPrefixes('Re: Fwd:')).toBe('');
  });

  it('flattens case and spacing for comparison', () => {
    expect(normalizeSubject('Re:  The   Engine ')).toBe('the engine');
  });
});

describe('participantsOf', () => {
  it('collects every address on the message, lower-cased', () => {
    const people = participantsOf(
      message({
        id: 'a',
        from: 'Ada <ADA@local>',
        to: ['you@local'],
        cc: ['Grace <grace@local>'],
        bcc: ['charles@local'],
      }),
    );
    expect([...people].sort()).toEqual(['ada@local', 'charles@local', 'grace@local', 'you@local']);
  });
});

describe('sameThread', () => {
  const ada = message({ id: 'a', subject: 'Lunch?' });

  it('joins a reply to what it answers', () => {
    const reply = message({
      id: 'b',
      subject: 'Re: Lunch?',
      from: 'You <you@local>',
      to: ['Ada <ada@local>'],
      threadId: 'b',
    });
    expect(sameThread(ada, reply)).toBe(true);
  });

  it('keeps the same subject apart when nobody is shared', () => {
    const strangers = message({
      id: 'b',
      subject: 'Lunch?',
      from: 'Grace <grace@local>',
      to: ['Charles <charles@local>'],
      threadId: 'b',
    });
    expect(sameThread(ada, strangers)).toBe(false);
  });

  it('keeps the same people apart when the subject differs', () => {
    expect(sameThread(ada, message({ id: 'b', subject: 'Dinner?', threadId: 'b' }))).toBe(false);
  });

  it('never joins two messages that have no subject at all', () => {
    const one = message({ id: 'a', subject: '', threadId: 'a' });
    const two = message({ id: 'b', subject: 'Re:', threadId: 'b' });
    expect(sameThread(one, two)).toBe(false);
  });

  it('joins on a shared thread id whatever the subject says', () => {
    const one = message({ id: 'a', subject: 'Lunch?', threadId: 't' });
    const two = message({ id: 'b', subject: 'Something else', threadId: 't' });
    expect(sameThread(one, two)).toBe(true);
  });
});

describe('groupThreads', () => {
  it('puts a conversation together and orders it oldest first', () => {
    const threads = groupThreads([
      message({ id: 'b', subject: 'Re: Lunch?', date: 3_000, threadId: 'b' }),
      message({ id: 'a', subject: 'Lunch?', date: 1_000, threadId: 'a' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(threads[0]?.latest.id).toBe('b');
    expect(threads[0]?.subject).toBe('Lunch?');
  });

  it('is transitive: a chain that drops a recipient stays one conversation', () => {
    const first = message({
      id: 'a',
      from: 'Ada <ada@local>',
      to: ['you@local'],
      threadId: 'a',
      date: 1,
    });
    const second = message({
      id: 'b',
      subject: 'Re: Lunch?',
      from: 'You <you@local>',
      to: ['grace@local'],
      threadId: 'b',
      date: 2,
    });
    const third = message({
      id: 'c',
      subject: 'Re: Lunch?',
      from: 'Grace <grace@local>',
      to: ['charles@local'],
      threadId: 'c',
      date: 3,
    });
    const threads = groupThreads([first, second, third]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages).toHaveLength(3);
  });

  it('sorts conversations by their newest message', () => {
    const threads = groupThreads([
      message({ id: 'old', subject: 'Old', date: 1_000, threadId: 'old' }),
      message({ id: 'new', subject: 'New', date: 9_000, threadId: 'new' }),
      message({ id: 'old-reply', subject: 'Re: Old', date: 5_000, threadId: 'old-reply' }),
    ]);
    expect(threads.map((t) => t.subject)).toEqual(['New', 'Old']);
  });

  it('counts what the list row has to show', () => {
    const threads = groupThreads([
      message({ id: 'a', read: false, threadId: 't' }),
      message({
        id: 'b',
        read: true,
        flagged: true,
        threadId: 't',
        date: 2_000,
        attachments: [{ name: 'notes.txt', path: '/home/a/notes.txt', size: 4 }],
      }),
    ]);
    expect(threads[0]?.unread).toBe(1);
    expect(threads[0]?.flagged).toBe(true);
    expect(threads[0]?.attachments).toBe(1);
  });

  it('takes its id from the earliest message, whatever order it arrives in', () => {
    const messages = [
      message({ id: 'b', subject: 'Re: Lunch?', date: 3_000, threadId: 'b' }),
      message({ id: 'a', subject: 'Lunch?', date: 1_000, threadId: 'a' }),
    ];
    expect(groupThreads(messages)[0]?.id).toBe('a');
    expect(groupThreads([...messages].reverse())[0]?.id).toBe('a');
  });

  it('gives every subject-less message a conversation of its own', () => {
    const threads = groupThreads([
      message({ id: 'a', subject: '', threadId: 'a' }),
      message({ id: 'b', subject: '', threadId: 'b' }),
    ]);
    expect(threads).toHaveLength(2);
  });

  it('has nothing to group in an empty mailbox', () => {
    expect(groupThreads([])).toEqual([]);
  });
});

describe('threadOf', () => {
  it('finds the conversation holding a message, and copes with none', () => {
    const threads = groupThreads([message({ id: 'a', threadId: 'a' })]);
    expect(threadOf(threads, 'a')?.id).toBe('a');
    expect(threadOf(threads, 'missing')).toBeNull();
    expect(threadOf(threads, null)).toBeNull();
  });
});

describe('sortThreads', () => {
  const threads = groupThreads([
    message({ id: 'a', from: 'Zoe <zoe@local>', subject: 'Apples', date: 1_000, threadId: 'a' }),
    message({ id: 'b', from: 'Ada <ada@local>', subject: 'Zebras', date: 9_000, threadId: 'b' }),
    message({
      id: 'c',
      from: 'Mia <mia@local>',
      to: ['Ada <ada@local>'],
      subject: 'Mangoes',
      date: 5_000,
      threadId: 'c',
    }),
  ]);

  it('leaves the date order alone', () => {
    expect(sortThreads(threads, 'date').map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders by the sender, and by the recipient in Sent', () => {
    expect(sortThreads(threads, 'from').map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(sortThreads(threads, 'from', true).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by subject', () => {
    expect(sortThreads(threads, 'subject').map((t) => t.subject)).toEqual([
      'Apples',
      'Mangoes',
      'Zebras',
    ]);
  });

  it('falls back to newest first when the keys are equal', () => {
    const same = groupThreads([
      message({ id: 'x', from: 'Ada <ada@local>', subject: 'Alpha', date: 1, threadId: 'x' }),
      message({ id: 'y', from: 'Ada <ada@local>', subject: 'Beta', date: 2, threadId: 'y' }),
    ]);
    expect(sortThreads(same, 'from').map((t) => t.id)).toEqual(['y', 'x']);
  });

  it('does not disturb the list it was given', () => {
    const before = [...threads];
    sortThreads(threads, 'subject');
    expect(threads).toEqual(before);
  });
});

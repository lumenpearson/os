import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DATA,
  deliveredId,
  folderIdFor,
  type MailData,
  type Message,
  mailboxCounts,
  mailboxLabel,
  mailReducer,
  messagesIn,
  newMessageId,
  normalizeData,
  seed,
  seedMessages,
} from './store';

function message(patch: Partial<Message> & { id: string }): Message {
  return {
    mailbox: 'inbox',
    from: 'Ada Lovelace <ada@local>',
    to: ['You <you@local>'],
    cc: [],
    bcc: [],
    subject: 'Subject',
    body: 'Body',
    date: 1_000,
    read: false,
    flagged: false,
    threadId: patch.id,
    attachments: [],
    inReplyTo: null,
    previousMailbox: null,
    ...patch,
  };
}

function data(messages: Message[], patch: Partial<MailData> = {}): MailData {
  return { ...DEFAULT_DATA, messages, ...patch };
}

describe('normalizeData', () => {
  it('falls back to an empty mailbox for anything that is not an object', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('mail')).toEqual(DEFAULT_DATA);
    expect(normalizeData([1, 2])).toEqual(DEFAULT_DATA);
  });

  it('drops messages without an id and de-duplicates the rest', () => {
    const read = normalizeData({
      messages: [{ subject: 'no id' }, { id: 'a' }, { id: 'a', subject: 'second' }],
    });
    expect(read.messages.map((m) => m.id)).toEqual(['a']);
    expect(read.messages[0]?.subject).toBe('');
  });

  it('files a message in an unknown mailbox back in the inbox', () => {
    const read = normalizeData({ messages: [{ id: 'a', mailbox: 'folder:gone' }] });
    expect(read.messages[0]?.mailbox).toBe('inbox');
  });

  it('keeps a message in a folder the file also declares', () => {
    const read = normalizeData({
      folders: [{ id: 'folder:work', name: 'Work' }],
      messages: [{ id: 'a', mailbox: 'folder:work' }],
    });
    expect(read.messages[0]?.mailbox).toBe('folder:work');
  });

  it('defaults the thread id to the message id and coerces the flags', () => {
    const read = normalizeData({ messages: [{ id: 'a', read: 'yes', flagged: 1 }] });
    expect(read.messages[0]?.threadId).toBe('a');
    expect(read.messages[0]?.read).toBe(false);
    expect(read.messages[0]?.flagged).toBe(false);
  });

  it('keeps only attachments that name a path', () => {
    const read = normalizeData({
      messages: [
        {
          id: 'a',
          attachments: [
            { name: 'a.txt', path: '/home/a/a.txt', size: 12 },
            { name: 'lost.txt' },
            'nonsense',
            { path: '/home/a/b.txt', size: -5 },
          ],
        },
      ],
    });
    expect(read.messages[0]?.attachments).toEqual([
      { name: 'a.txt', path: '/home/a/a.txt', size: 12 },
      { name: 'b.txt', path: '/home/a/b.txt', size: 0 },
    ]);
  });

  it('rejects folders without the folder prefix, and duplicate ids', () => {
    const read = normalizeData({
      folders: [
        { id: 'folder:work', name: 'Work' },
        { id: 'inbox', name: 'Fake Inbox' },
        { id: 'folder:work', name: 'Work again' },
        { id: 'folder:blank', name: '  ' },
      ],
    });
    expect(read.folders).toEqual([{ id: 'folder:work', name: 'Work' }]);
  });

  it('refuses a stored preference that names a mailbox that is gone', () => {
    const read = normalizeData({ prefs: { sort: 'sideways', mailbox: 'folder:gone' } });
    expect(read.prefs).toEqual({ sort: 'date', showSidebar: true, mailbox: 'inbox' });
  });
});

describe('sending', () => {
  it('files a copy in Sent and delivers another to the Inbox', () => {
    const composed = message({ id: 'm1', mailbox: 'drafts', subject: 'Hello' });
    const next = mailReducer(data([composed]), { type: 'send', message: composed });

    expect(messagesIn(next, 'drafts')).toHaveLength(0);
    const sent = messagesIn(next, 'sent');
    const inbox = messagesIn(next, 'inbox');
    expect(sent.map((m) => m.id)).toEqual(['m1']);
    expect(inbox.map((m) => m.id)).toEqual([deliveredId('m1')]);
    expect(sent[0]?.read).toBe(true);
    expect(inbox[0]?.read).toBe(false);
    expect(inbox[0]?.threadId).toBe(sent[0]?.threadId);
  });

  it('sending the same message twice does not leave two copies', () => {
    const composed = message({ id: 'm1' });
    const once = mailReducer(data([]), { type: 'send', message: composed });
    const twice = mailReducer(once, { type: 'send', message: composed });
    expect(twice.messages).toHaveLength(2);
  });
});

describe('drafts', () => {
  it('replaces the stored draft rather than adding a second one', () => {
    const first = message({ id: 'd1', mailbox: 'drafts', subject: 'One' });
    const saved = mailReducer(data([]), { type: 'saveDraft', message: first });
    const again = mailReducer(saved, {
      type: 'saveDraft',
      message: { ...first, subject: 'Two' },
    });
    expect(again.messages).toHaveLength(1);
    expect(again.messages[0]?.subject).toBe('Two');
  });

  it('files a draft in Drafts even when it arrives claiming another mailbox', () => {
    const stray = message({ id: 'd1', mailbox: 'sent' });
    const next = mailReducer(data([]), { type: 'saveDraft', message: stray });
    expect(next.messages[0]?.mailbox).toBe('drafts');
  });

  it('discards only a draft, never a sent message with the same id', () => {
    const sent = message({ id: 'd1', mailbox: 'sent' });
    const next = mailReducer(data([sent]), { type: 'discardDraft', id: 'd1' });
    expect(next.messages).toHaveLength(1);
  });
});

describe('moving, deleting and restoring', () => {
  it('remembers where a message came from when it moves', () => {
    const next = mailReducer(data([message({ id: 'a' })]), {
      type: 'move',
      ids: ['a'],
      to: 'archive',
    });
    expect(next.messages[0]?.mailbox).toBe('archive');
    expect(next.messages[0]?.previousMailbox).toBe('inbox');
  });

  it('refuses a move to a mailbox that does not exist', () => {
    const before = data([message({ id: 'a' })]);
    expect(mailReducer(before, { type: 'move', ids: ['a'], to: 'folder:nope' })).toBe(before);
  });

  it('deletes to Trash from anywhere else, and for good from Trash', () => {
    const first = mailReducer(data([message({ id: 'a', mailbox: 'sent' })]), {
      type: 'delete',
      ids: ['a'],
    });
    expect(first.messages[0]?.mailbox).toBe('trash');

    const second = mailReducer(first, { type: 'delete', ids: ['a'] });
    expect(second.messages).toHaveLength(0);
  });

  it('restores a message to the mailbox it was deleted from', () => {
    const deleted = mailReducer(data([message({ id: 'a', mailbox: 'sent' })]), {
      type: 'delete',
      ids: ['a'],
    });
    const back = mailReducer(deleted, { type: 'restore', ids: ['a'] });
    expect(back.messages[0]?.mailbox).toBe('sent');
    expect(back.messages[0]?.previousMailbox).toBeNull();
  });

  it('restores to the Inbox when the old mailbox is gone', () => {
    const trashed = data([message({ id: 'a', mailbox: 'trash', previousMailbox: 'folder:gone' })]);
    const back = mailReducer(trashed, { type: 'restore', ids: ['a'] });
    expect(back.messages[0]?.mailbox).toBe('inbox');
  });

  it('leaves a message alone when Restore is asked for outside Trash', () => {
    const before = data([message({ id: 'a', mailbox: 'archive', previousMailbox: 'inbox' })]);
    const after = mailReducer(before, { type: 'restore', ids: ['a'] });
    expect(after.messages[0]?.mailbox).toBe('archive');
  });

  it('empties the Trash and nothing else', () => {
    const before = data([
      message({ id: 'a', mailbox: 'trash' }),
      message({ id: 'b', mailbox: 'inbox' }),
    ]);
    const after = mailReducer(before, { type: 'emptyTrash' });
    expect(after.messages.map((m) => m.id)).toEqual(['b']);
  });
});

describe('read and flag', () => {
  it('marks the named messages and leaves the others', () => {
    const before = data([message({ id: 'a' }), message({ id: 'b' })]);
    const after = mailReducer(before, { type: 'setRead', ids: ['a'], read: true });
    expect(after.messages[0]?.read).toBe(true);
    expect(after.messages[1]?.read).toBe(false);
  });

  it('keeps the same objects when a flag is set to what it already is', () => {
    const before = data([message({ id: 'a', flagged: true })]);
    const after = mailReducer(before, { type: 'setFlagged', ids: ['a'], flagged: true });
    expect(after.messages[0]).toBe(before.messages[0]);
  });
});

describe('folders', () => {
  it('makes an id from the name and numbers a clash', () => {
    const one = mailReducer(data([]), { type: 'createFolder', name: 'Project X' });
    const two = mailReducer(one, { type: 'createFolder', name: 'project x' });
    expect(one.folders[0]?.id).toBe('folder:project-x');
    expect(two.folders[1]?.id).toBe('folder:project-x-2');
    expect(two.folders[1]?.name).toBe('project x');
  });

  it('ignores a folder with a blank name', () => {
    const before = data([]);
    expect(mailReducer(before, { type: 'createFolder', name: '   ' })).toBe(before);
  });

  it('renames a folder without touching the messages in it', () => {
    const made = mailReducer(data([]), { type: 'createFolder', name: 'Work' });
    const withMail = { ...made, messages: [message({ id: 'a', mailbox: 'folder:work' })] };
    const renamed = mailReducer(withMail, {
      type: 'renameFolder',
      id: 'folder:work',
      name: 'Day job',
    });
    expect(mailboxLabel(renamed, 'folder:work')).toBe('Day job');
    expect(renamed.messages[0]?.mailbox).toBe('folder:work');
  });

  it('deleting a folder sends what was in it to Trash and moves the selection home', () => {
    const made = mailReducer(data([]), { type: 'createFolder', name: 'Work' });
    const before: MailData = {
      ...made,
      messages: [message({ id: 'a', mailbox: 'folder:work' })],
      prefs: { ...made.prefs, mailbox: 'folder:work' },
    };
    const after = mailReducer(before, { type: 'deleteFolder', id: 'folder:work' });
    expect(after.folders).toHaveLength(0);
    expect(after.messages[0]?.mailbox).toBe('trash');
    expect(after.messages[0]?.previousMailbox).toBe('folder:work');
    expect(after.prefs.mailbox).toBe('inbox');
  });

  it('folderIdFor falls back when a name has no letters at all', () => {
    expect(folderIdFor('***', [])).toBe('folder:folder');
  });
});

describe('counts', () => {
  it('totals every mailbox in one pass, unread separately', () => {
    const made = mailReducer(data([]), { type: 'createFolder', name: 'Work' });
    const before: MailData = {
      ...made,
      messages: [
        message({ id: 'a' }),
        message({ id: 'b', read: true }),
        message({ id: 'c', mailbox: 'folder:work' }),
      ],
    };
    const counts = mailboxCounts(before);
    expect(counts.inbox).toEqual({ total: 2, unread: 1 });
    expect(counts['folder:work']).toEqual({ total: 1, unread: 1 });
    expect(counts.sent).toEqual({ total: 0, unread: 0 });
  });
});

describe('the first run', () => {
  it('seeds two unread messages from the system address', () => {
    const seeded = seed(DEFAULT_DATA, 5_000, 'You <you@local>');
    expect(seeded.messages).toHaveLength(2);
    expect(seeded.messages.every((m) => m.from === 'Lumen <system@local>')).toBe(true);
    expect(seeded.messages.every((m) => m.mailbox === 'inbox' && !m.read)).toBe(true);
    expect(seeded.seeded).toBe(true);
  });

  it('says what the app is and lists the shortcuts', () => {
    const [welcome, shortcuts] = seedMessages(0, 'you@local');
    expect(welcome?.body).toContain('nothing you write here leaves the machine');
    expect(shortcuts?.body).toContain('Mod+N');
  });

  it('never seeds a second time', () => {
    const once = seed(DEFAULT_DATA, 5_000, 'you@local');
    const emptied = mailReducer(once, { type: 'delete', ids: once.messages.map((m) => m.id) });
    const cleared = mailReducer(emptied, { type: 'emptyTrash' });
    expect(seed(cleared, 6_000, 'you@local').messages).toHaveLength(0);
  });
});

describe('newMessageId', () => {
  it('gives a different id every time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newMessageId()));
    expect(ids.size).toBe(50);
  });
});

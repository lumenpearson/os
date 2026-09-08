/**
 * The mailbox itself: what a message is, how the file on disk is read back,
 * and every change the app can make to it.
 *
 * There is no account and no server. Messages are records in one JSON file
 * under the user's home, so "sending" writes a copy to Sent and delivers a
 * second copy to Inbox — the only address this computer knows is its own.
 * The reducer is pure; the two impure helpers at the bottom (ids and the
 * clock) are called by the component and handed in.
 */

export const SYSTEM_MAILBOXES = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'] as const;

export type SystemMailbox = (typeof SYSTEM_MAILBOXES)[number];

export const MAILBOX_LABELS: Record<SystemMailbox, string> = {
  inbox: 'Inbox',
  drafts: 'Drafts',
  sent: 'Sent',
  archive: 'Archive',
  junk: 'Junk',
  trash: 'Trash',
};

/** User folders carry this prefix so they can never shadow a system mailbox. */
export const FOLDER_PREFIX = 'folder:';

export interface Attachment {
  /** File name as shown in the message. */
  name: string;
  /** The real VFS path the file was attached from. */
  path: string;
  size: number;
}

export interface Message {
  id: string;
  mailbox: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** Plain text. Nothing in this app renders HTML. */
  body: string;
  /** Epoch milliseconds. */
  date: number;
  read: boolean;
  flagged: boolean;
  threadId: string;
  attachments: Attachment[];
  /** Id of the message this one answers, or null. */
  inReplyTo: string | null;
  /**
   * Where the message sat before it was moved. Bookkeeping for Restore, so a
   * sent message pulled out of Trash goes back to Sent and not to Inbox.
   */
  previousMailbox: string | null;
}

export interface MailFolder {
  id: string;
  name: string;
}

export const SORT_KEYS = ['date', 'from', 'subject'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  date: 'Date',
  from: 'From',
  subject: 'Subject',
};

export interface MailPrefs {
  sort: SortKey;
  showSidebar: boolean;
  /** The mailbox the window opens on. */
  mailbox: string;
}

export interface MailData {
  messages: Message[];
  folders: MailFolder[];
  prefs: MailPrefs;
  /** The first-run seed has been written. It never runs twice. */
  seeded: boolean;
}

export const DEFAULT_PREFS: MailPrefs = { sort: 'date', showSidebar: true, mailbox: 'inbox' };

export const DEFAULT_DATA: MailData = {
  messages: [],
  folders: [],
  prefs: DEFAULT_PREFS,
  seeded: false,
};

export function isSystemMailbox(id: string): id is SystemMailbox {
  return (SYSTEM_MAILBOXES as readonly string[]).includes(id);
}

// ── reading the file ──────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function readAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  const out: Attachment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const path = readString(entry.path);
    if (path === '') continue;
    const size = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : 0;
    out.push({
      name: readString(entry.name) || path.slice(path.lastIndexOf('/') + 1),
      path,
      size: Math.max(0, Math.round(size)),
    });
  }
  return out;
}

function readMessage(value: unknown, known: ReadonlySet<string>): Message | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  if (id === '') return null;
  const mailbox = readString(value.mailbox);
  const date = typeof value.date === 'number' && Number.isFinite(value.date) ? value.date : 0;
  const previous = readString(value.previousMailbox);
  return {
    id,
    mailbox: known.has(mailbox) ? mailbox : 'inbox',
    from: readString(value.from),
    to: readStrings(value.to),
    cc: readStrings(value.cc),
    bcc: readStrings(value.bcc),
    subject: readString(value.subject),
    body: readString(value.body),
    date: Math.round(date),
    read: value.read === true,
    flagged: value.flagged === true,
    threadId: readString(value.threadId) || id,
    attachments: readAttachments(value.attachments),
    inReplyTo: readString(value.inReplyTo) || null,
    previousMailbox: known.has(previous) ? previous : null,
  };
}

function readFolders(value: unknown): MailFolder[] {
  if (!Array.isArray(value)) return [];
  const out: MailFolder[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = readString(entry.id);
    const name = readString(entry.name).trim();
    if (!id.startsWith(FOLDER_PREFIX) || name === '' || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

function readPrefs(value: unknown, known: ReadonlySet<string>): MailPrefs {
  if (!isRecord(value)) return DEFAULT_PREFS;
  const sort = readString(value.sort) as SortKey;
  const mailbox = readString(value.mailbox);
  return {
    sort: SORT_KEYS.includes(sort) ? sort : DEFAULT_PREFS.sort,
    showSidebar: value.showSidebar === false ? false : DEFAULT_PREFS.showSidebar,
    mailbox: known.has(mailbox) ? mailbox : DEFAULT_PREFS.mailbox,
  };
}

/** The file is text a user can edit, so nothing read out of it is trusted. */
export function normalizeData(raw: unknown): MailData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  const folders = readFolders(raw.folders);
  const known = new Set<string>([...SYSTEM_MAILBOXES, ...folders.map((f) => f.id)]);
  const messages: Message[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.messages)) {
    for (const entry of raw.messages) {
      const message = readMessage(entry, known);
      if (!message || seen.has(message.id)) continue;
      seen.add(message.id);
      messages.push(message);
    }
  }
  return {
    messages,
    folders,
    prefs: readPrefs(raw.prefs, known),
    seeded: raw.seeded === true,
  };
}

// ── reading the mailbox ───────────────────────────────────────────────────

export function mailboxIds(data: MailData): string[] {
  return [...SYSTEM_MAILBOXES, ...data.folders.map((f) => f.id)];
}

export function mailboxLabel(data: MailData, id: string): string {
  if (isSystemMailbox(id)) return MAILBOX_LABELS[id];
  return data.folders.find((f) => f.id === id)?.name ?? id;
}

export function messagesIn(data: MailData, mailbox: string): Message[] {
  return data.messages.filter((m) => m.mailbox === mailbox);
}

export interface MailboxCount {
  total: number;
  unread: number;
}

/** One pass over the messages for every mailbox's totals. */
export function mailboxCounts(data: MailData): Record<string, MailboxCount> {
  const counts: Record<string, MailboxCount> = {};
  for (const id of mailboxIds(data)) counts[id] = { total: 0, unread: 0 };
  for (const message of data.messages) {
    const bucket = counts[message.mailbox];
    if (!bucket) continue;
    bucket.total += 1;
    if (!message.read) bucket.unread += 1;
  }
  return counts;
}

/**
 * The id a new folder takes: its name, lower-cased and hyphenated, with a
 * number appended if that id is taken.
 */
export function folderIdFor(name: string, existing: readonly MailFolder[]): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'folder';
  const taken = new Set(existing.map((f) => f.id));
  let id = `${FOLDER_PREFIX}${slug}`;
  let n = 2;
  while (taken.has(id)) {
    id = `${FOLDER_PREFIX}${slug}-${n}`;
    n += 1;
  }
  return id;
}

/** The id of the loopback copy that a sent message is delivered under. */
export function deliveredId(id: string): string {
  return `${id}.delivered`;
}

// ── changing the mailbox ──────────────────────────────────────────────────

export type MailAction =
  | { type: 'send'; message: Message }
  | { type: 'saveDraft'; message: Message }
  | { type: 'discardDraft'; id: string }
  | { type: 'move'; ids: readonly string[]; to: string }
  | { type: 'delete'; ids: readonly string[] }
  | { type: 'restore'; ids: readonly string[] }
  | { type: 'setRead'; ids: readonly string[]; read: boolean }
  | { type: 'setFlagged'; ids: readonly string[]; flagged: boolean }
  | { type: 'emptyTrash' }
  | { type: 'createFolder'; name: string }
  | { type: 'renameFolder'; id: string; name: string }
  | { type: 'deleteFolder'; id: string };

function moveOne(message: Message, to: string): Message {
  if (message.mailbox === to) return message;
  return { ...message, mailbox: to, previousMailbox: message.mailbox };
}

export function mailReducer(data: MailData, action: MailAction): MailData {
  switch (action.type) {
    case 'send': {
      const sent: Message = {
        ...action.message,
        mailbox: 'sent',
        read: true,
        previousMailbox: null,
      };
      const delivered: Message = {
        ...action.message,
        id: deliveredId(action.message.id),
        mailbox: 'inbox',
        read: false,
        flagged: false,
        previousMailbox: null,
      };
      const rest = data.messages.filter((m) => m.id !== sent.id && m.id !== delivered.id);
      return { ...data, messages: [...rest, sent, delivered] };
    }
    case 'saveDraft': {
      const draft: Message = {
        ...action.message,
        mailbox: 'drafts',
        read: true,
        previousMailbox: null,
      };
      const index = data.messages.findIndex((m) => m.id === draft.id);
      if (index < 0) return { ...data, messages: [...data.messages, draft] };
      const messages = [...data.messages];
      messages[index] = draft;
      return { ...data, messages };
    }
    case 'discardDraft':
      return {
        ...data,
        messages: data.messages.filter((m) => !(m.id === action.id && m.mailbox === 'drafts')),
      };
    case 'move': {
      if (!mailboxIds(data).includes(action.to)) return data;
      const ids = new Set(action.ids);
      return {
        ...data,
        messages: data.messages.map((m) => (ids.has(m.id) ? moveOne(m, action.to) : m)),
      };
    }
    case 'delete': {
      const ids = new Set(action.ids);
      const messages: Message[] = [];
      for (const message of data.messages) {
        if (!ids.has(message.id)) {
          messages.push(message);
          continue;
        }
        // Deleting from Trash is permanent; deleting anywhere else is a move.
        if (message.mailbox === 'trash') continue;
        messages.push(moveOne(message, 'trash'));
      }
      return { ...data, messages };
    }
    case 'restore': {
      const ids = new Set(action.ids);
      const known = mailboxIds(data);
      return {
        ...data,
        messages: data.messages.map((m) => {
          if (!ids.has(m.id) || m.mailbox !== 'trash') return m;
          const back =
            m.previousMailbox && known.includes(m.previousMailbox) ? m.previousMailbox : 'inbox';
          return { ...m, mailbox: back, previousMailbox: null };
        }),
      };
    }
    case 'setRead': {
      const ids = new Set(action.ids);
      return {
        ...data,
        messages: data.messages.map((m) =>
          ids.has(m.id) && m.read !== action.read ? { ...m, read: action.read } : m,
        ),
      };
    }
    case 'setFlagged': {
      const ids = new Set(action.ids);
      return {
        ...data,
        messages: data.messages.map((m) =>
          ids.has(m.id) && m.flagged !== action.flagged ? { ...m, flagged: action.flagged } : m,
        ),
      };
    }
    case 'emptyTrash':
      return { ...data, messages: data.messages.filter((m) => m.mailbox !== 'trash') };
    case 'createFolder': {
      const name = action.name.trim();
      if (name === '') return data;
      const id = folderIdFor(name, data.folders);
      return { ...data, folders: [...data.folders, { id, name }] };
    }
    case 'renameFolder': {
      const name = action.name.trim();
      if (name === '' || !data.folders.some((f) => f.id === action.id)) return data;
      return {
        ...data,
        folders: data.folders.map((f) => (f.id === action.id ? { ...f, name } : f)),
      };
    }
    case 'deleteFolder': {
      if (!data.folders.some((f) => f.id === action.id)) return data;
      return {
        ...data,
        folders: data.folders.filter((f) => f.id !== action.id),
        // The folder goes; what was in it is recoverable from Trash.
        messages: data.messages.map((m) => (m.mailbox === action.id ? moveOne(m, 'trash') : m)),
        prefs: data.prefs.mailbox === action.id ? { ...data.prefs, mailbox: 'inbox' } : data.prefs,
      };
    }
    default:
      return data;
  }
}

// ── the first run ─────────────────────────────────────────────────────────

export const SYSTEM_ADDRESS = 'Lumen <system@local>';

const WELCOME_BODY = `This is a mailbox on this computer. There is no account and no
connection: every message you see is a record in a file under your home
folder, and nothing you write here leaves the machine.

Send delivers to Sent, and because the only address this computer knows is
its own, a copy arrives back in Inbox. Attachments are references to real
files in the file system, so opening one opens the file itself.

Mailboxes down the left, messages in the middle, the message you are reading
on the right. Make folders of your own with File > New Folder.`;

const SHORTCUTS_BODY = `New Message      Mod+N
Save Draft       Mod+S
Find             Mod+F
Reply            Mod+R
Reply All        Shift+Mod+R
Forward          Shift+Mod+F
Mark as Unread   Shift+Mod+U
Flag             Shift+Mod+L
Move to Archive  Shift+Mod+A
Delete           Delete
Sidebar          Shift+Mod+S

Mod is Command on macOS and Control elsewhere; Settings > Keyboard changes
which one. Arrow keys move through the message list, Enter opens a message,
and Escape leaves the reading pane on a narrow window.`;

/**
 * The two messages a new mailbox starts with. Written once, when the store
 * file is absent — never on a later launch, and never over a mailbox the
 * user has emptied.
 */
export function seedMessages(now: number, to: string): Message[] {
  const common = {
    mailbox: 'inbox',
    from: SYSTEM_ADDRESS,
    cc: [],
    bcc: [],
    read: false,
    flagged: false,
    attachments: [],
    inReplyTo: null,
    previousMailbox: null,
  } satisfies Partial<Message>;
  return [
    {
      ...common,
      id: 'seed.welcome',
      threadId: 'seed.welcome',
      to: [to],
      subject: 'This mailbox is on your computer',
      body: WELCOME_BODY,
      date: now - 60_000,
    },
    {
      ...common,
      id: 'seed.shortcuts',
      threadId: 'seed.shortcuts',
      to: [to],
      subject: 'Keyboard shortcuts',
      body: SHORTCUTS_BODY,
      date: now - 30_000,
    },
  ];
}

export function seed(data: MailData, now: number, to: string): MailData {
  if (data.seeded) return data;
  return { ...data, seeded: true, messages: [...data.messages, ...seedMessages(now, to)] };
}

/** The one impure helper: a fresh message id. Kept out of the reducer. */
export function newMessageId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

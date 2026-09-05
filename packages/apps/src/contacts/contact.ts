/**
 * The record an address book keeps, and the store around it.
 *
 * A contact is a plain value: every field has a defined shape, empty means the
 * empty string rather than `undefined`, and lists are always arrays. That is
 * what lets the vCard round trip below compare two contacts with `toEqual`,
 * and what keeps the editor from having to guard every field.
 *
 * The file on disk is text a user can edit, so nothing read back is trusted:
 * `normalizeData` rebuilds the whole structure from `unknown`.
 */

export const SORT_KEYS = ['first', 'last'] as const;

/** Sort the list by given name or by family name. */
export type SortKey = (typeof SORT_KEYS)[number];

export interface LabelledValue {
  /** "home", "work", "mobile", or anything a vCard carried in. Lower case. */
  label: string;
  value: string;
}

export interface PostalAddress {
  label: string;
  street: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

export interface Contact {
  id: string;
  given: string;
  family: string;
  nickname: string;
  organisation: string;
  title: string;
  emails: LabelledValue[];
  phones: LabelledValue[];
  addresses: PostalAddress[];
  urls: LabelledValue[];
  /** ISO `YYYY-MM-DD`, or empty. */
  birthday: string;
  notes: string;
  favourite: boolean;
  groups: string[];
  /** A path in the VFS, or null. */
  photo: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContactsPrefs {
  sort: SortKey;
  showGroups: boolean;
  /** The group filter: a group name, "favourites", or null for everything. */
  group: string | null;
  /** The contact that is the signed-in user, shown as "Me". */
  meId: string | null;
}

export interface ContactsData {
  /**
   * 0 means the file has never been written by this app, which is how the
   * first run tells "no store yet" from "a store the user emptied".
   */
  version: number;
  contacts: Contact[];
  prefs: ContactsPrefs;
}

export const CURRENT_VERSION = 1;

export const DEFAULT_PREFS: ContactsPrefs = {
  sort: 'first',
  showGroups: true,
  group: null,
  meId: null,
};

export const DEFAULT_DATA: ContactsData = { version: 0, contacts: [], prefs: DEFAULT_PREFS };

/** The pseudo-group for starred contacts; not a real group name. */
export const FAVOURITES = 'favourites';

let counter = 0;

/** An id unique within a session; collisions across sessions are resolved on import. */
export function newContactId(): string {
  counter += 1;
  return `c${Date.now().toString(36)}${counter.toString(36)}`;
}

export function emptyContact(id: string, now: number): Contact {
  return {
    id,
    given: '',
    family: '',
    nickname: '',
    organisation: '',
    title: '',
    emails: [],
    phones: [],
    addresses: [],
    urls: [],
    birthday: '',
    notes: '',
    favourite: false,
    groups: [],
    photo: null,
    createdAt: now,
    updatedAt: now,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function readLabelled(value: unknown): LabelledValue | null {
  if (!isRecord(value)) return null;
  const text = readString(value.value).trim();
  if (text === '') return null;
  return { label: normalizeLabel(readString(value.label)), value: text };
}

function readAddress(value: unknown): PostalAddress | null {
  if (!isRecord(value)) return null;
  const address: PostalAddress = {
    label: normalizeLabel(readString(value.label)),
    street: readString(value.street).trim(),
    city: readString(value.city).trim(),
    region: readString(value.region).trim(),
    postcode: readString(value.postcode).trim(),
    country: readString(value.country).trim(),
  };
  return isBlankAddress(address) ? null : address;
}

/**
 * Labels are compared and exported case-insensitively, so they are stored
 * folded. The characters a vCard parameter uses as separators are taken out:
 * a label is one word for a kind of number, and `TYPE="a,b"` would come back
 * as two.
 */
export function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/["',;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBlankAddress(address: PostalAddress): boolean {
  return (
    `${address.street}${address.city}${address.region}${address.postcode}${address.country}`.trim()
      .length === 0
  );
}

/** `YYYY-MM-DD` for a real calendar date, else the empty string. */
export function normalizeBirthday(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return '';
  const [, year = '', month = '', day = ''] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  // Rejects 2026-02-30, which Date rolls forward instead of refusing.
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? `${year}-${month}-${day}`
    : '';
}

/** Group names keep their case but are compared and de-duplicated folded. */
export function normalizeGroups(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name === '') continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function readTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeContact(raw: unknown, fallbackId: string, now: number): Contact | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw.id).trim() || fallbackId;
  const created = readTimestamp(raw.createdAt, now);
  const photo = readString(raw.photo).trim();
  return {
    id,
    given: readString(raw.given).trim(),
    family: readString(raw.family).trim(),
    nickname: readString(raw.nickname).trim(),
    organisation: readString(raw.organisation).trim(),
    title: readString(raw.title).trim(),
    emails: readArray(raw.emails)
      .map(readLabelled)
      .filter((e): e is LabelledValue => e !== null),
    phones: readArray(raw.phones)
      .map(readLabelled)
      .filter((p): p is LabelledValue => p !== null),
    addresses: readArray(raw.addresses)
      .map(readAddress)
      .filter((a): a is PostalAddress => a !== null),
    urls: readArray(raw.urls)
      .map(readLabelled)
      .filter((u): u is LabelledValue => u !== null),
    birthday: normalizeBirthday(readString(raw.birthday)),
    // One line ending, so a note survives an export and an import unchanged.
    notes: readString(raw.notes).replace(/\r\n?/g, '\n'),
    favourite: raw.favourite === true,
    groups: normalizeGroups(readArray(raw.groups).map(readString)),
    photo: photo === '' ? null : photo,
    createdAt: created,
    updatedAt: readTimestamp(raw.updatedAt, created),
  };
}

function readPrefs(raw: unknown): ContactsPrefs {
  if (!isRecord(raw)) return DEFAULT_PREFS;
  const sort = raw.sort;
  const group = readString(raw.group).trim();
  const meId = readString(raw.meId).trim();
  return {
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_PREFS.sort,
    showGroups: typeof raw.showGroups === 'boolean' ? raw.showGroups : DEFAULT_PREFS.showGroups,
    group: group === '' ? null : group,
    meId: meId === '' ? null : meId,
  };
}

/** Rebuild the store from whatever the file held. Duplicate ids are re-issued. */
export function normalizeData(raw: unknown, now = Date.now()): ContactsData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  const seen = new Set<string>();
  const contacts: Contact[] = [];
  readArray(raw.contacts).forEach((entry, index) => {
    const contact = normalizeContact(entry, `contact-${index}`, now);
    if (!contact) return;
    if (seen.has(contact.id)) contact.id = `${contact.id}-${index}`;
    seen.add(contact.id);
    contacts.push(contact);
  });
  return {
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0,
    contacts,
    prefs: readPrefs(raw.prefs),
  };
}

/** True while the store has never been written, which is the only time to seed it. */
export function shouldSeed(data: ContactsData): boolean {
  return data.version < CURRENT_VERSION;
}

/** The signed-in user's own card, from the account name. */
export function contactFromUser(
  user: { name: string; username: string },
  id: string,
  now: number,
): Contact {
  const parts = user.name.trim().split(/\s+/).filter(Boolean);
  const given = parts[0] ?? user.username;
  return {
    ...emptyContact(id, now),
    given,
    family: parts.slice(1).join(' '),
  };
}

/**
 * The draft as it would be stored: values trimmed, blank rows dropped, labels
 * and groups folded. Saving and comparing both go through this, so a trailing
 * space is not a change.
 */
export function cleanContact(contact: Contact): Contact {
  return normalizeContact(contact, contact.id, contact.createdAt) ?? contact;
}

/**
 * Equal in everything a person typed, ignoring when the record was touched.
 * Both sides come from the same construction path, so their keys are in the
 * same order and one serialisation can stand for a field-by-field compare.
 */
export function sameContent(a: Contact, b: Contact): boolean {
  const bare = (contact: Contact) => JSON.stringify({ ...contact, createdAt: 0, updatedAt: 0 });
  return bare(a) === bare(b);
}

/** "3 added, 1 updated" — what an import actually did. */
export function summariseImport(added: number, updated: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (updated > 0) parts.push(`${updated} updated`);
  return parts.length === 0 ? 'Nothing changed' : parts.join(', ');
}

export type ContactsAction =
  | { type: 'create'; contact: Contact }
  | { type: 'update'; id: string; patch: Contact; now: number }
  | { type: 'delete'; id: string }
  | { type: 'favourite'; id: string; favourite: boolean; now: number }
  /** Adds new cards and replaces existing ones that carry the same id. */
  | { type: 'import'; contacts: Contact[] }
  | { type: 'replace'; keep: Contact; drop: string[] };

export function contactsReducer(contacts: Contact[], action: ContactsAction): Contact[] {
  switch (action.type) {
    case 'create':
      return [...contacts, action.contact];
    case 'update': {
      const next = { ...action.patch, id: action.id, updatedAt: action.now };
      return contacts.map((c) => (c.id === action.id ? { ...next, createdAt: c.createdAt } : c));
    }
    case 'delete':
      return contacts.filter((c) => c.id !== action.id);
    case 'favourite':
      return contacts.map((c) =>
        c.id === action.id ? { ...c, favourite: action.favourite, updatedAt: action.now } : c,
      );
    case 'import': {
      const byId = new Map(action.contacts.map((c) => [c.id, c]));
      const merged = contacts.map((c) => byId.get(c.id) ?? c);
      const existing = new Set(contacts.map((c) => c.id));
      return [...merged, ...action.contacts.filter((c) => !existing.has(c.id))];
    }
    case 'replace': {
      const dropped = new Set(action.drop);
      const kept = contacts.map((c) => (c.id === action.keep.id ? action.keep : c));
      return kept.filter((c) => !dropped.has(c.id) || c.id === action.keep.id);
    }
  }
}

export interface GroupCount {
  name: string;
  count: number;
}

/** Every group in use, with how many contacts are in it, ordered by name. */
export function groupCounts(contacts: readonly Contact[]): GroupCount[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const contact of contacts) {
    for (const group of contact.groups) {
      const key = group.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { name: group, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The contacts a group filter selects. `null` is everything. */
export function filterByGroup(contacts: readonly Contact[], group: string | null): Contact[] {
  if (group === null) return [...contacts];
  if (group === FAVOURITES) return contacts.filter((c) => c.favourite);
  const key = group.toLowerCase();
  return contacts.filter((c) => c.groups.some((g) => g.toLowerCase() === key));
}

/** `1980-05-04` as a readable date. Empty in, empty out. */
export function formatBirthday(birthday: string, locale?: string): string {
  const iso = normalizeBirthday(birthday);
  if (iso === '') return '';
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Duplicates, and putting two cards back into one.
 *
 * Two records are likely the same person when they share an email address, a
 * phone number once punctuation is off it, or a display name. Sharing runs
 * transitively: if A and B share a number and B and C share a name, all three
 * are one pile, because merging them pairwise would leave the same result.
 *
 * The merge itself never drops a value. Single-valued fields take the primary
 * card's answer and fall back to the other's; lists are concatenated and
 * de-duplicated; notes that differ are kept one after the other.
 */

import type { Contact, LabelledValue, PostalAddress } from './contact';
import { normalizeGroups } from './contact';
import { phoneDigits } from './search';
import { displayName } from './sort';

export type DuplicateReason = 'email' | 'phone' | 'name';

export interface DuplicateGroup {
  /** Stable across renders: the member ids in order. */
  id: string;
  reason: DuplicateReason;
  contacts: Contact[];
}

/** Shorter than this, a "number" is not evidence of anything. */
const MIN_PHONE_DIGITS = 5;

const REASON_RANK: Record<DuplicateReason, number> = { email: 0, phone: 1, name: 2 };

export interface DuplicateKey {
  key: string;
  reason: DuplicateReason;
}

/** What would make this card the same as another one. */
export function duplicateKeys(contact: Contact): DuplicateKey[] {
  const keys: DuplicateKey[] = [];
  for (const email of contact.emails) {
    const value = email.value.trim().toLowerCase();
    if (value !== '') keys.push({ key: `email:${value}`, reason: 'email' });
  }
  for (const phone of contact.phones) {
    const digits = phoneDigits(phone.value);
    if (digits.length >= MIN_PHONE_DIGITS) keys.push({ key: `phone:${digits}`, reason: 'phone' });
  }
  const name = displayName(contact).trim().toLowerCase();
  if (name !== '') keys.push({ key: `name:${name}`, reason: 'name' });
  return keys;
}

/** Piles of two or more records that look like the same person. */
export function findDuplicates(contacts: readonly Contact[]): DuplicateGroup[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    let next = parent.get(root);
    while (next !== undefined && next !== root) {
      root = next;
      next = parent.get(root);
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const owners = new Map<string, string>();
  const reasons = new Map<string, DuplicateReason>();
  for (const contact of contacts) {
    parent.set(contact.id, parent.get(contact.id) ?? contact.id);
    for (const { key, reason } of duplicateKeys(contact)) {
      const owner = owners.get(key);
      if (owner === undefined) {
        owners.set(key, contact.id);
        continue;
      }
      union(owner, contact.id);
      const root = find(owner);
      const known = reasons.get(root);
      if (known === undefined || REASON_RANK[reason] < REASON_RANK[known]) {
        reasons.set(root, reason);
      }
    }
  }

  const piles = new Map<string, Contact[]>();
  for (const contact of contacts) {
    const root = find(contact.id);
    const pile = piles.get(root);
    if (pile) pile.push(contact);
    else piles.set(root, [contact]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, pile] of piles) {
    if (pile.length < 2) continue;
    // The root may have moved during unions; take the strongest reason seen
    // for any member of the pile.
    let reason: DuplicateReason = reasons.get(root) ?? 'name';
    for (const member of pile) {
      const known = reasons.get(find(member.id));
      if (known && REASON_RANK[known] < REASON_RANK[reason]) reason = known;
    }
    groups.push({ id: pile.map((c) => c.id).join('+'), reason, contacts: pile });
  }
  return groups;
}

function pick(primary: string, secondary: string): string {
  return primary.trim() !== '' ? primary : secondary;
}

const plainKey = (value: string) => value.trim().toLowerCase();

/** Two spellings of one number are one number, as they are for detection. */
const phoneKey = (value: string) => phoneDigits(value) || plainKey(value);

function mergeLabelled(
  primary: readonly LabelledValue[],
  secondary: readonly LabelledValue[],
  keyOf: (value: string) => string,
): LabelledValue[] {
  const out: LabelledValue[] = [];
  const seen = new Map<string, number>();
  for (const entry of [...primary, ...secondary]) {
    const key = keyOf(entry.value);
    if (key === '') continue;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push({ ...entry });
      continue;
    }
    // Same value twice: keep the one that carries a label.
    const kept = out[at];
    if (kept && kept.label === '' && entry.label !== '') out[at] = { ...kept, label: entry.label };
  }
  return out;
}

function addressKey(address: PostalAddress): string {
  return [address.street, address.city, address.region, address.postcode, address.country]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function mergeAddresses(
  primary: readonly PostalAddress[],
  secondary: readonly PostalAddress[],
): PostalAddress[] {
  const out: PostalAddress[] = [];
  const seen = new Set<string>();
  for (const address of [...primary, ...secondary]) {
    const key = addressKey(address);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...address });
  }
  return out;
}

function mergeNotes(primary: string, secondary: string): string {
  const a = primary.trim();
  const b = secondary.trim();
  if (a === '') return b;
  if (b === '' || a === b) return a;
  return `${a}\n\n${b}`;
}

/** One record with everything both cards knew. The primary's id survives. */
export function mergeContacts(primary: Contact, secondary: Contact, now: number): Contact {
  return {
    id: primary.id,
    given: pick(primary.given, secondary.given),
    family: pick(primary.family, secondary.family),
    nickname: pick(primary.nickname, secondary.nickname),
    organisation: pick(primary.organisation, secondary.organisation),
    title: pick(primary.title, secondary.title),
    emails: mergeLabelled(primary.emails, secondary.emails, plainKey),
    phones: mergeLabelled(primary.phones, secondary.phones, phoneKey),
    addresses: mergeAddresses(primary.addresses, secondary.addresses),
    urls: mergeLabelled(primary.urls, secondary.urls, plainKey),
    birthday: pick(primary.birthday, secondary.birthday),
    notes: mergeNotes(primary.notes, secondary.notes),
    favourite: primary.favourite || secondary.favourite,
    groups: normalizeGroups([...primary.groups, ...secondary.groups]),
    photo: primary.photo ?? secondary.photo,
    createdAt: Math.min(primary.createdAt, secondary.createdAt),
    updatedAt: now,
  };
}

/** Fold a whole pile into the first record. */
export function mergeAll(contacts: readonly Contact[], now: number): Contact | null {
  const [first, ...rest] = contacts;
  if (!first) return null;
  return rest.reduce((kept, next) => mergeContacts(kept, next, now), first);
}

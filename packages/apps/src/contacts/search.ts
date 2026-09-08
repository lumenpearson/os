/**
 * Searching the address book.
 *
 * Two ways of matching, because two things get typed into the box:
 *
 * - **Text.** Every word has to appear somewhere on the card, though not in
 *   the same field: "ada london" finds Ada Lovelace with a London address.
 *   Case and accents are folded on both sides, so "jose" finds "José".
 * - **Digits.** A number is matched with the punctuation removed from both
 *   sides, so "5551234" finds "+1 (555) 123-4567" and so does "555 1234".
 *
 * A hit says which field it came from, so the list can print the reason under
 * the name instead of leaving the reader to guess.
 */

import type { Contact } from './contact';

export type MatchField =
  | 'name'
  | 'nickname'
  | 'organisation'
  | 'title'
  | 'email'
  | 'phone'
  | 'address'
  | 'url'
  | 'birthday'
  | 'note'
  | 'group';

/** Reported in this order when a query hits several fields. */
const FIELD_ORDER: readonly MatchField[] = [
  'name',
  'nickname',
  'organisation',
  'title',
  'email',
  'phone',
  'address',
  'url',
  'group',
  'birthday',
  'note',
];

export const FIELD_LABELS: Record<MatchField, string> = {
  name: 'name',
  nickname: 'nickname',
  organisation: 'organisation',
  title: 'job title',
  email: 'email',
  phone: 'phone',
  address: 'address',
  url: 'website',
  birthday: 'birthday',
  note: 'note',
  group: 'group',
};

export interface SearchHit {
  contact: Contact;
  field: MatchField;
}

/** Lower case, accents removed, so "José" and "jose" are the same string. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Only the digits, which is all a phone number is once punctuation is gone. */
export function phoneDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

/** True when the query is a number fragment rather than a word. */
export function isPhoneQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === '') return false;
  return /^[+\d\s().\-/]+$/.test(trimmed) && phoneDigits(trimmed).length >= 2;
}

/** Punctuation ignored on both sides; a fragment matches anywhere in the number. */
export function phoneMatches(value: string, query: string): boolean {
  const wanted = phoneDigits(query);
  if (wanted.length < 2) return false;
  return phoneDigits(value).includes(wanted);
}

/** Every searchable string on a card, by the field it came from. */
function fieldsOf(contact: Contact): Array<[MatchField, string]> {
  const fields: Array<[MatchField, string]> = [
    ['name', `${contact.given} ${contact.family}`],
    ['nickname', contact.nickname],
    ['organisation', contact.organisation],
    ['title', contact.title],
    ['birthday', contact.birthday],
    ['note', contact.notes],
  ];
  for (const email of contact.emails) fields.push(['email', `${email.label} ${email.value}`]);
  for (const phone of contact.phones) fields.push(['phone', `${phone.label} ${phone.value}`]);
  for (const url of contact.urls) fields.push(['url', `${url.label} ${url.value}`]);
  for (const group of contact.groups) fields.push(['group', group]);
  for (const address of contact.addresses) {
    fields.push([
      'address',
      [
        address.label,
        address.street,
        address.city,
        address.region,
        address.postcode,
        address.country,
      ].join(' '),
    ]);
  }
  return fields;
}

function bestField(matched: ReadonlySet<MatchField>): MatchField | null {
  for (const field of FIELD_ORDER) if (matched.has(field)) return field;
  return null;
}

/** The field a query hits on this contact, or null when it misses. */
export function matchContact(contact: Contact, query: string): MatchField | null {
  const trimmed = query.trim();
  if (trimmed === '') return 'name';
  const fields = fieldsOf(contact);

  if (isPhoneQuery(trimmed)) {
    const hit = contact.phones.some((phone) => phoneMatches(phone.value, trimmed));
    if (hit) return 'phone';
    // A digit query still falls through to text, so "1980" finds a birthday.
  }

  const terms = fold(trimmed).split(/\s+/).filter(Boolean);
  const matched = new Set<MatchField>();
  for (const term of terms) {
    let found = false;
    for (const [field, text] of fields) {
      if (text !== '' && fold(text).includes(term)) {
        matched.add(field);
        found = true;
      }
    }
    if (!found) return null;
  }
  return bestField(matched);
}

/** The contacts a query matches, in the order they were given. */
export function searchContacts(contacts: readonly Contact[], query: string): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const contact of contacts) {
    const field = matchContact(contact, query);
    if (field) hits.push({ contact, field });
  }
  return hits;
}

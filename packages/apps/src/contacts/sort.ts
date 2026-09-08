/**
 * Naming and ordering.
 *
 * A contact's display name falls back from the name to the organisation,
 * because a card for a company has no given name and still has to read as
 * something. The list is ordered with an `Intl.Collator`, so "Ångström" lands
 * where the reader's language puts it rather than where its code point does.
 *
 * Sections are the A–Z index down the side of the list. A name that does not
 * start with a Latin letter — a number, a symbol, a script with no bucket
 * here — goes into "#", which sits after Z the way it does in an address book.
 */

import type { Contact, SortKey } from './contact';

export const SECTION_OTHER = '#';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Rail order: A–Z, then the bucket for everything else. */
export const SECTION_LETTERS: readonly string[] = [...ALPHABET, SECTION_OTHER];

export const SORT_LABELS: Record<SortKey, string> = {
  first: 'Sort by First Name',
  last: 'Sort by Last Name',
};

/**
 * Latin letters that carry no canonical decomposition, so stripping combining
 * marks leaves them alone. Without this, Ørsted files under "#".
 */
const FOLDED_LETTERS: Record<string, string> = {
  Ø: 'O',
  Æ: 'A',
  Œ: 'O',
  Ł: 'L',
  Đ: 'D',
  Ð: 'D',
  Þ: 'T',
  ẞ: 'S',
  İ: 'I',
  Ħ: 'H',
  Ŧ: 'T',
  Ə: 'E',
};

const collators = new Map<string, Intl.Collator>();

function collatorFor(locale?: string): Intl.Collator {
  const key = locale ?? '';
  const existing = collators.get(key);
  if (existing) return existing;
  const collator = new Intl.Collator(locale || undefined, {
    sensitivity: 'base',
    numeric: true,
    usage: 'sort',
  });
  collators.set(key, collator);
  return collator;
}

export interface NameParts {
  given: string;
  family: string;
  organisation: string;
}

/** What the list, the window title and a vCard's FN call this contact. */
export function displayName(contact: NameParts): string {
  const name = `${contact.given} ${contact.family}`.trim().replace(/\s+/g, ' ');
  return name || contact.organisation.trim();
}

/** The string the list is ordered on: family first when sorting by last name. */
export function sortName(contact: NameParts, sort: SortKey): string {
  const given = contact.given.trim();
  const family = contact.family.trim();
  if (given === '' && family === '') return contact.organisation.trim();
  const ordered = sort === 'last' ? [family, given] : [given, family];
  return ordered.filter(Boolean).join(' ');
}

/** Two initials for the avatar when a contact has no photo. */
export function initials(contact: NameParts): string {
  const given = contact.given.trim();
  const family = contact.family.trim();
  const letters = given || family ? [given, family] : contact.organisation.trim().split(/\s+/);
  return letters
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('')
    .toUpperCase();
}

/** The A–Z bucket a sort key belongs to. */
export function sectionOf(key: string): string {
  const first = [...key.trim()][0];
  if (first === undefined) return SECTION_OTHER;
  const upper = first.toUpperCase();
  const folded =
    FOLDED_LETTERS[upper] ??
    upper
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .charAt(0);
  return /^[A-Z]$/.test(folded) ? folded : SECTION_OTHER;
}

export function sectionFor(contact: Contact, sort: SortKey): string {
  return sectionOf(sortName(contact, sort));
}

/** "#" sorts after Z, so an address book reads A–Z and then the oddities. */
function sectionRank(section: string): number {
  return section === SECTION_OTHER ? 1 : 0;
}

export function compareContacts(a: Contact, b: Contact, sort: SortKey, locale?: string): number {
  const rank = sectionRank(sectionFor(a, sort)) - sectionRank(sectionFor(b, sort));
  if (rank !== 0) return rank;
  const collator = collatorFor(locale);
  const byKey = collator.compare(sortName(a, sort), sortName(b, sort));
  if (byKey !== 0) return byKey;
  const byName = collator.compare(displayName(a), displayName(b));
  if (byName !== 0) return byName;
  // Same name, same organisation: order by id so the list never shuffles.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortContacts(
  contacts: readonly Contact[],
  sort: SortKey,
  locale?: string,
): Contact[] {
  return [...contacts].sort((a, b) => compareContacts(a, b, sort, locale));
}

export interface ContactSection {
  letter: string;
  contacts: Contact[];
}

/** The sorted list cut into A–Z sections, in list order. */
export function sectionize(
  contacts: readonly Contact[],
  sort: SortKey,
  locale?: string,
): ContactSection[] {
  const sections: ContactSection[] = [];
  for (const contact of sortContacts(contacts, sort, locale)) {
    const letter = sectionFor(contact, sort);
    const last = sections[sections.length - 1];
    if (last && last.letter === letter) last.contacts.push(contact);
    else sections.push({ letter, contacts: [contact] });
  }
  return sections;
}

/** The letters the rail can actually jump to. */
export function sectionsPresent(sections: readonly ContactSection[]): Set<string> {
  return new Set(sections.map((section) => section.letter));
}

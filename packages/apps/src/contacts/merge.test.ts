import { describe, expect, it } from 'vitest';
import { type Contact, emptyContact } from './contact';
import { duplicateKeys, findDuplicates, mergeAll, mergeContacts } from './merge';

const NOW = Date.UTC(2026, 8, 5);
const LATER = Date.UTC(2026, 8, 6);

function make(id: string, patch: Partial<Contact> = {}): Contact {
  return { ...emptyContact(id, NOW), ...patch };
}

const ids = (contacts: readonly Contact[]) => contacts.map((c) => c.id).sort();

describe('duplicate keys', () => {
  it('keys on email, phone digits and display name', () => {
    const contact = make('a', {
      given: 'Ada',
      emails: [{ label: '', value: 'Ada@Example.org' }],
      phones: [{ label: '', value: '+1 (555) 123-4567' }],
    });
    expect(duplicateKeys(contact)).toEqual([
      { key: 'email:ada@example.org', reason: 'email' },
      { key: 'phone:15551234567', reason: 'phone' },
      { key: 'name:ada', reason: 'name' },
    ]);
  });

  it('ignores a number too short to identify anyone', () => {
    const contact = make('a', { phones: [{ label: '', value: '112' }] });
    expect(duplicateKeys(contact)).toEqual([]);
  });

  it('has no key for a card with nothing on it', () => {
    expect(duplicateKeys(make('a'))).toEqual([]);
  });
});

describe('finding duplicates', () => {
  it('groups two cards that share an email', () => {
    const a = make('a', { given: 'Ada', emails: [{ label: '', value: 'ada@example.org' }] });
    const b = make('b', { given: 'A.', emails: [{ label: 'work', value: 'ADA@example.org' }] });
    const groups = findDuplicates([a, b]);
    expect(groups).toHaveLength(1);
    expect(ids(groups[0]?.contacts ?? [])).toEqual(['a', 'b']);
    expect(groups[0]?.reason).toBe('email');
  });

  it('groups two cards whose numbers differ only in punctuation', () => {
    const a = make('a', { given: 'Ada', phones: [{ label: '', value: '+1 (555) 123-4567' }] });
    const b = make('b', { given: 'Augusta', phones: [{ label: '', value: '+15551234567' }] });
    expect(findDuplicates([a, b])[0]?.reason).toBe('phone');
  });

  it('groups two cards with the same display name', () => {
    const groups = findDuplicates([
      make('a', { given: 'Ada', family: 'Lovelace' }),
      make('b', { given: 'ada', family: 'LOVELACE' }),
    ]);
    expect(groups[0]?.reason).toBe('name');
  });

  it('follows the chain: A shares a number with B, B shares a name with C', () => {
    const a = make('a', { given: 'Ada', phones: [{ label: '', value: '5551234' }] });
    const b = make('b', { given: 'Countess', phones: [{ label: '', value: '555 1234' }] });
    const c = make('c', { given: 'Countess', emails: [{ label: '', value: 'c@example.org' }] });
    const groups = findDuplicates([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(ids(groups[0]?.contacts ?? [])).toEqual(['a', 'b', 'c']);
  });

  it('reports the strongest reason a pile has', () => {
    const a = make('a', {
      given: 'Ada',
      emails: [{ label: '', value: 'ada@example.org' }],
    });
    const b = make('b', { given: 'Ada', emails: [{ label: '', value: 'ada@example.org' }] });
    expect(findDuplicates([a, b])[0]?.reason).toBe('email');
  });

  it('leaves distinct people alone', () => {
    const a = make('a', { given: 'Ada', emails: [{ label: '', value: 'ada@example.org' }] });
    const b = make('b', { given: 'Grace', emails: [{ label: '', value: 'grace@example.mil' }] });
    expect(findDuplicates([a, b])).toEqual([]);
  });

  it('does not pile up the empty cards', () => {
    expect(findDuplicates([make('a'), make('b'), make('c')])).toEqual([]);
  });

  it('finds nothing in an empty book', () => {
    expect(findDuplicates([])).toEqual([]);
  });

  it('gives each pile an id that does not move between renders', () => {
    const a = make('a', { given: 'Ada' });
    const b = make('b', { given: 'Ada' });
    expect(findDuplicates([a, b])[0]?.id).toBe(findDuplicates([a, b])[0]?.id);
  });
});

describe('merging two records', () => {
  const primary = make('a', {
    given: 'Ada',
    family: '',
    organisation: 'Analytical Engine',
    emails: [{ label: 'home', value: 'ada@example.org' }],
    phones: [{ label: '', value: '+1 555 1234' }],
    notes: 'Met at the exhibition.',
    groups: ['Friends'],
    createdAt: Date.UTC(2020, 0, 1),
    updatedAt: Date.UTC(2020, 0, 1),
  });

  const secondary = make('b', {
    given: 'Augusta',
    family: 'Lovelace',
    title: 'Mathematician',
    emails: [
      { label: 'work', value: 'ADA@example.org' },
      { label: 'work', value: 'countess@example.org' },
    ],
    phones: [{ label: 'mobile', value: '+1-555-1234' }],
    addresses: [
      {
        label: 'home',
        street: '12 Marylebone Rd',
        city: 'London',
        region: '',
        postcode: '',
        country: '',
      },
    ],
    notes: 'Wrote note G.',
    groups: ['Work', 'friends'],
    favourite: true,
    photo: '/home/me/ada.png',
    createdAt: Date.UTC(2019, 0, 1),
    updatedAt: Date.UTC(2021, 0, 1),
  });

  const merged = mergeContacts(primary, secondary, LATER);

  it('keeps the primary record and its id', () => {
    expect(merged.id).toBe('a');
    expect(merged.given).toBe('Ada');
  });

  it('fills a field the primary left empty', () => {
    expect(merged.family).toBe('Lovelace');
    expect(merged.title).toBe('Mathematician');
  });

  it('loses no value from either list', () => {
    expect(merged.emails.map((e) => e.value)).toEqual(['ada@example.org', 'countess@example.org']);
    expect(merged.addresses).toHaveLength(1);
  });

  it('treats two spellings of one number as one number', () => {
    expect(merged.phones).toEqual([{ label: 'mobile', value: '+1 555 1234' }]);
  });

  it('keeps both notes', () => {
    expect(merged.notes).toBe('Met at the exhibition.\n\nWrote note G.');
  });

  it('unions the groups, folding case', () => {
    expect(merged.groups).toEqual(['Friends', 'Work']);
  });

  it('is a favourite if either was, and takes the only photo there is', () => {
    expect(merged.favourite).toBe(true);
    expect(merged.photo).toBe('/home/me/ada.png');
  });

  it('dates from the earlier record and is modified now', () => {
    expect(merged.createdAt).toBe(Date.UTC(2019, 0, 1));
    expect(merged.updatedAt).toBe(LATER);
  });

  it('takes a label from the second card when the first had none', () => {
    const withLabel = mergeContacts(
      make('a', { phones: [{ label: '', value: '555' }] }),
      make('b', { phones: [{ label: 'work', value: '555' }] }),
      LATER,
    );
    expect(withLabel.phones).toEqual([{ label: 'work', value: '555' }]);
  });

  it('does not repeat a note that both cards carried', () => {
    const same = mergeContacts(
      make('a', { notes: 'Same note.' }),
      make('b', { notes: 'Same note.' }),
      LATER,
    );
    expect(same.notes).toBe('Same note.');
  });

  it('changes neither record it was given', () => {
    expect(primary.emails).toHaveLength(1);
    expect(secondary.groups).toEqual(['Work', 'friends']);
  });
});

describe('merging a pile', () => {
  it('folds every card into the first', () => {
    const merged = mergeAll(
      [
        make('a', { given: 'Ada' }),
        make('b', { family: 'Lovelace' }),
        make('c', { title: 'Mathematician' }),
      ],
      LATER,
    );
    expect(merged?.id).toBe('a');
    expect(merged?.given).toBe('Ada');
    expect(merged?.family).toBe('Lovelace');
    expect(merged?.title).toBe('Mathematician');
  });

  it('has nothing to fold when the pile is empty', () => {
    expect(mergeAll([], LATER)).toBeNull();
  });
});

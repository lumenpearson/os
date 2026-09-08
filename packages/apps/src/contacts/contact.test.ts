import { describe, expect, it } from 'vitest';
import {
  type Contact,
  CURRENT_VERSION,
  cleanContact,
  contactFromUser,
  contactsReducer,
  DEFAULT_DATA,
  emptyContact,
  FAVOURITES,
  filterByGroup,
  formatBirthday,
  groupCounts,
  isBlankAddress,
  newContactId,
  normalizeBirthday,
  normalizeData,
  normalizeGroups,
  normalizeLabel,
  sameContent,
  shouldSeed,
  summariseImport,
} from './contact';

const NOW = Date.UTC(2026, 8, 5);
const LATER = Date.UTC(2026, 8, 6);

function make(id: string, patch: Partial<Contact> = {}): Contact {
  return { ...emptyContact(id, NOW), ...patch };
}

describe('normalizeLabel', () => {
  it('folds case and collapses spaces', () => {
    expect(normalizeLabel('  Work  Mobile ')).toBe('work mobile');
  });

  it('takes out the characters a vCard parameter uses as separators', () => {
    expect(normalizeLabel('home,work;other')).toBe('home work other');
  });
});

describe('normalizeBirthday', () => {
  it.each([
    ['1980-05-04', '1980-05-04'],
    ['  1980-05-04 ', '1980-05-04'],
    ['1980-2-4', ''],
    ['1980-02-30', ''],
    ['1980-13-01', ''],
    ['not a date', ''],
    ['', ''],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizeBirthday(input)).toBe(expected);
  });

  it('accepts a leap day that exists', () => {
    expect(normalizeBirthday('2024-02-29')).toBe('2024-02-29');
    expect(normalizeBirthday('2023-02-29')).toBe('');
  });
});

describe('formatBirthday', () => {
  it('writes the date out in words', () => {
    expect(formatBirthday('1815-12-10', 'en-GB')).toBe('10 December 1815');
  });

  it('is empty for a date that is not one', () => {
    expect(formatBirthday('nope', 'en-GB')).toBe('');
  });
});

describe('normalizeGroups', () => {
  it('drops blanks and repeats, keeping the first spelling', () => {
    expect(normalizeGroups(['Work', ' ', 'work', 'Friends'])).toEqual(['Work', 'Friends']);
  });

  it('collapses the spaces inside a name', () => {
    expect(normalizeGroups(['  Book   Club '])).toEqual(['Book Club']);
  });
});

describe('reading the store back', () => {
  it('returns the default for anything that is not an object', () => {
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('[]')).toEqual(DEFAULT_DATA);
    expect(normalizeData(42)).toEqual(DEFAULT_DATA);
  });

  it('fills in every field of a half-written contact', () => {
    const data = normalizeData({ version: 1, contacts: [{ given: 'Ada' }] }, NOW);
    expect(data.contacts[0]).toEqual({
      ...emptyContact('contact-0', NOW),
      given: 'Ada',
    });
  });

  it('throws away entries that are not objects', () => {
    const data = normalizeData({ contacts: ['x', null, { given: 'Ada' }] }, NOW);
    expect(data.contacts).toHaveLength(1);
  });

  it('drops list entries with no value', () => {
    const data = normalizeData(
      { contacts: [{ emails: [{ value: '  ' }, { value: 'a@b.c' }, 7] }] },
      NOW,
    );
    expect(data.contacts[0]?.emails).toEqual([{ label: '', value: 'a@b.c' }]);
  });

  it('drops an address with nothing in it but a label', () => {
    const data = normalizeData({ contacts: [{ addresses: [{ label: 'home' }] }] }, NOW);
    expect(data.contacts[0]?.addresses).toEqual([]);
  });

  it('re-issues an id that appears twice', () => {
    const data = normalizeData({ contacts: [{ id: 'x' }, { id: 'x' }] }, NOW);
    expect(data.contacts[1]?.id).toBe('x-1');
  });

  it('refuses a preference it does not know', () => {
    const data = normalizeData({ prefs: { sort: 'middle', showGroups: 'yes' } });
    expect(data.prefs.sort).toBe('first');
    expect(data.prefs.showGroups).toBe(true);
  });

  it('reads a stored group filter and the "me" card', () => {
    const data = normalizeData({ prefs: { group: 'Work', meId: 'c1' } });
    expect(data.prefs.group).toBe('Work');
    expect(data.prefs.meId).toBe('c1');
  });

  it('normalises one line ending inside a note', () => {
    const data = normalizeData({ contacts: [{ notes: 'a\r\nb' }] }, NOW);
    expect(data.contacts[0]?.notes).toBe('a\nb');
  });

  it('dates a contact that carries no timestamps', () => {
    const data = normalizeData({ contacts: [{ given: 'Ada' }] }, NOW);
    expect(data.contacts[0]?.createdAt).toBe(NOW);
    expect(data.contacts[0]?.updatedAt).toBe(NOW);
  });
});

describe('seeding', () => {
  it('seeds while the store has never been written', () => {
    expect(shouldSeed(DEFAULT_DATA)).toBe(true);
  });

  it('does not seed a store the user has emptied', () => {
    expect(shouldSeed({ ...DEFAULT_DATA, version: CURRENT_VERSION })).toBe(false);
  });

  it('makes a card from the account name', () => {
    const contact = contactFromUser({ name: 'Ada Byron King', username: 'ada' }, 'me', NOW);
    expect(contact.given).toBe('Ada');
    expect(contact.family).toBe('Byron King');
  });

  it('falls back to the user name when the account has no full name', () => {
    expect(contactFromUser({ name: '', username: 'ada' }, 'me', NOW).given).toBe('ada');
  });
});

describe('a draft on its way to the store', () => {
  it('trims what was typed and drops the rows left blank', () => {
    const draft = make('a', {
      given: '  Ada  ',
      emails: [
        { label: 'HOME', value: ' ada@example.org ' },
        { label: '', value: '   ' },
      ],
      groups: ['Work', 'work', ' '],
      birthday: 'nonsense',
    });
    const clean = cleanContact(draft);
    expect(clean.given).toBe('Ada');
    expect(clean.emails).toEqual([{ label: 'home', value: 'ada@example.org' }]);
    expect(clean.groups).toEqual(['Work']);
    expect(clean.birthday).toBe('');
  });

  it('keeps the id and the date the record was made', () => {
    const draft = make('a', { createdAt: 42 });
    expect(cleanContact(draft).id).toBe('a');
    expect(cleanContact(draft).createdAt).toBe(42);
  });

  it('counts a trailing space as no change at all', () => {
    const stored = make('a', { given: 'Ada' });
    expect(sameContent(cleanContact(make('a', { given: 'Ada ' })), stored)).toBe(true);
  });

  it('sees a real edit', () => {
    expect(sameContent(make('a', { given: 'Ada' }), make('a', { given: 'Augusta' }))).toBe(false);
  });

  it('ignores when the record was last touched', () => {
    expect(sameContent(make('a', { updatedAt: 1 }), make('a', { updatedAt: 2 }))).toBe(true);
  });
});

describe('summariseImport', () => {
  it.each([
    [3, 0, '3 added'],
    [0, 2, '2 updated'],
    [3, 1, '3 added, 1 updated'],
    [0, 0, 'Nothing changed'],
  ])('reads %i added and %i updated as "%s"', (added, updated, expected) => {
    expect(summariseImport(added, updated)).toBe(expected);
  });
});

describe('ids', () => {
  it('does not repeat', () => {
    expect(newContactId()).not.toBe(newContactId());
  });
});

describe('the reducer', () => {
  const ada = make('a', { given: 'Ada' });
  const bob = make('b', { given: 'Bob' });

  it('adds a contact', () => {
    expect(contactsReducer([ada], { type: 'create', contact: bob })).toEqual([ada, bob]);
  });

  it('replaces a contact and stamps it, keeping the date it was made', () => {
    const next = contactsReducer([ada], {
      type: 'update',
      id: 'a',
      patch: { ...ada, given: 'Augusta' },
      now: LATER,
    });
    expect(next[0]?.given).toBe('Augusta');
    expect(next[0]?.updatedAt).toBe(LATER);
    expect(next[0]?.createdAt).toBe(NOW);
  });

  it('removes a contact', () => {
    expect(contactsReducer([ada, bob], { type: 'delete', id: 'a' })).toEqual([bob]);
  });

  it('stars a contact', () => {
    const next = contactsReducer([ada], {
      type: 'favourite',
      id: 'a',
      favourite: true,
      now: LATER,
    });
    expect(next[0]?.favourite).toBe(true);
    expect(next[0]?.updatedAt).toBe(LATER);
  });

  it('adds imported cards and replaces the ones it already had', () => {
    const next = contactsReducer([ada, bob], {
      type: 'import',
      contacts: [make('a', { given: 'Ada L.' }), make('c', { given: 'Grace' })],
    });
    expect(next.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(next[0]?.given).toBe('Ada L.');
  });

  it('puts a merged record in place of the pile', () => {
    const merged = make('a', { given: 'Ada', family: 'Lovelace' });
    const next = contactsReducer([ada, bob], { type: 'replace', keep: merged, drop: ['b'] });
    expect(next).toEqual([merged]);
  });

  it('leaves the array it was given alone', () => {
    const list = [ada];
    contactsReducer(list, { type: 'create', contact: bob });
    expect(list).toHaveLength(1);
  });
});

describe('groups', () => {
  const list = [
    make('a', { given: 'Ada', groups: ['Work', 'Friends'], favourite: true }),
    make('b', { given: 'Bob', groups: ['friends'] }),
    make('c', { given: 'Cy' }),
  ];

  it('counts the members of each group, folding case', () => {
    expect(groupCounts(list)).toEqual([
      { name: 'Friends', count: 2 },
      { name: 'Work', count: 1 },
    ]);
  });

  it('filters by group, by favourites, and by nothing', () => {
    expect(filterByGroup(list, 'friends').map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterByGroup(list, FAVOURITES).map((c) => c.id)).toEqual(['a']);
    expect(filterByGroup(list, null)).toHaveLength(3);
  });

  it('finds nobody in a group that no longer exists', () => {
    expect(filterByGroup(list, 'Cycling')).toEqual([]);
  });
});

describe('isBlankAddress', () => {
  it('is blank when only the label is filled in', () => {
    expect(
      isBlankAddress({
        label: 'home',
        street: '',
        city: '',
        region: '',
        postcode: '',
        country: '',
      }),
    ).toBe(true);
  });

  it('is not blank once any line is', () => {
    expect(
      isBlankAddress({
        label: '',
        street: '',
        city: 'London',
        region: '',
        postcode: '',
        country: '',
      }),
    ).toBe(false);
  });
});

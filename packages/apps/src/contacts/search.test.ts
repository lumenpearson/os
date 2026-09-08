import { describe, expect, it } from 'vitest';
import { type Contact, emptyContact } from './contact';
import {
  fold,
  isPhoneQuery,
  matchContact,
  phoneDigits,
  phoneMatches,
  searchContacts,
} from './search';

const NOW = Date.UTC(2026, 8, 5);

function make(patch: Partial<Contact> = {}): Contact {
  return { ...emptyContact('id-1', NOW), ...patch };
}

const ada = make({
  id: 'ada',
  given: 'Ada',
  family: 'Lovelace',
  nickname: 'The Countess',
  organisation: 'Analytical Engine',
  title: 'Mathematician',
  emails: [{ label: 'home', value: 'ada@example.org' }],
  phones: [{ label: 'work', value: '+44 (20) 7946-0018' }],
  addresses: [
    {
      label: 'home',
      street: '12 Marylebone Rd',
      city: 'London',
      region: '',
      postcode: 'NW1 5JD',
      country: 'United Kingdom',
    },
  ],
  urls: [{ label: 'work', value: 'https://example.org' }],
  birthday: '1815-12-10',
  notes: 'Wrote note G on the engine.',
  groups: ['Friends'],
});

const jose = make({ id: 'jose', given: 'José', family: 'Ruiz' });

describe('folding', () => {
  it('strips case and accents', () => {
    expect(fold('José ÄRLIG')).toBe('jose arlig');
  });
});

describe('phone helpers', () => {
  it('keeps only the digits', () => {
    expect(phoneDigits('+44 (20) 7946-0018')).toBe('442079460018');
  });

  it.each([
    ['555 1234', true],
    ['+1 (555)', true],
    ['1', false],
    ['ada', false],
    ['', false],
    ['555a', false],
  ])('reads %s as a phone query: %s', (query, expected) => {
    expect(isPhoneQuery(query)).toBe(expected);
  });

  it('ignores punctuation on both sides', () => {
    expect(phoneMatches('+1 (555) 123-4567', '555 1234')).toBe(true);
    expect(phoneMatches('+1 (555) 123-4567', '5551234')).toBe(true);
    expect(phoneMatches('+1-555-123-4567', '(123).4567')).toBe(true);
  });

  it('refuses a fragment that is not in the number', () => {
    expect(phoneMatches('+1 555 123 4567', '999')).toBe(false);
  });

  it('refuses a fragment too short to mean anything', () => {
    expect(phoneMatches('+1 555 123 4567', '5')).toBe(false);
  });
});

describe('matching a contact', () => {
  it.each([
    ['ada', 'name'],
    ['LOVELACE', 'name'],
    ['countess', 'nickname'],
    ['analytical', 'organisation'],
    ['mathematician', 'title'],
    ['ada@example', 'email'],
    ['7946', 'phone'],
    ['marylebone', 'address'],
    ['NW1', 'address'],
    ['example.org', 'email'],
    ['1815', 'birthday'],
    ['wrote note', 'note'],
    ['friends', 'group'],
  ])('finds %s in the %s', (query, field) => {
    expect(matchContact(ada, query)).toBe(field);
  });

  it('matches a partial phone number with the punctuation ignored', () => {
    expect(matchContact(ada, '(20) 7946')).toBe('phone');
    expect(matchContact(ada, '2079460018')).toBe('phone');
  });

  it('lets a digit query fall through to the other fields', () => {
    // Not in the phone number, so the date is where it lands.
    expect(matchContact(ada, '1815-12')).toBe('birthday');
  });

  it('needs every word, though not in one field', () => {
    expect(matchContact(ada, 'ada london')).toBe('name');
    expect(matchContact(ada, 'ada paris')).toBeNull();
  });

  it('ignores accents on both sides', () => {
    expect(matchContact(jose, 'jose')).toBe('name');
    expect(matchContact(make({ given: 'Jose' }), 'josé')).toBe('name');
  });

  it('matches a label as well as a value', () => {
    expect(matchContact(ada, 'work')).toBe('phone');
  });

  it('misses what is not there', () => {
    expect(matchContact(ada, 'babbage')).toBeNull();
  });

  it('treats an empty query as a match on everything', () => {
    expect(matchContact(ada, '   ')).toBe('name');
  });

  it('reports the most identifying field when several hit', () => {
    const contact = make({ given: 'London', notes: 'London' });
    expect(matchContact(contact, 'london')).toBe('name');
  });
});

describe('searchContacts', () => {
  it('keeps the order it was given', () => {
    const hits = searchContacts([jose, ada], 'o');
    expect(hits.map((hit) => hit.contact.id)).toEqual(['jose', 'ada']);
  });

  it('reports the field each hit came from', () => {
    expect(searchContacts([ada], 'analytical')).toEqual([{ contact: ada, field: 'organisation' }]);
  });

  it('returns everything for an empty query', () => {
    expect(searchContacts([ada, jose], '')).toHaveLength(2);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchContacts([ada, jose], 'zzz')).toEqual([]);
  });
});

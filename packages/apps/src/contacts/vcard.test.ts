import { describe, expect, it } from 'vitest';
import { type Contact, emptyContact } from './contact';
import {
  escapeText,
  foldLine,
  parseProperty,
  parseVcardDate,
  parseVcards,
  serialiseVcard,
  serialiseVcards,
  splitList,
  splitStructured,
  unescapeText,
  unfold,
  VCARD_VERSIONS,
} from './vcard';

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

function make(patch: Partial<Contact> = {}): Contact {
  return { ...emptyContact('id-1', NOW), ...patch };
}

/** The physical lines of a serialised card, folds and all. */
function lines(text: string): string[] {
  return text.split('\r\n').filter((line) => line !== '');
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

describe('unfolding', () => {
  it('joins a continuation that starts with a space', () => {
    expect(unfold('NOTE:one \r\n two')).toEqual(['NOTE:one two']);
  });

  it('joins a continuation that starts with a tab', () => {
    expect(unfold('NOTE:one\r\n\ttwo')).toEqual(['NOTE:onetwo']);
  });

  it('removes exactly one character, so a space in the value survives', () => {
    expect(unfold('NOTE:half \r\n  way')).toEqual(['NOTE:half  way']);
  });

  it('accepts LF and CR line endings', () => {
    expect(unfold('A:1\nB:2\rC:3')).toEqual(['A:1', 'B:2', 'C:3']);
  });

  it('drops a byte-order mark', () => {
    expect(unfold('﻿BEGIN:VCARD')).toEqual(['BEGIN:VCARD']);
  });

  it('keeps a leading continuation that has nothing to continue', () => {
    expect(unfold(' orphan')).toEqual([' orphan']);
  });
});

describe('parsing one property line', () => {
  it('reads a bare property', () => {
    expect(parseProperty('FN:Ada Lovelace')).toEqual({
      group: '',
      name: 'FN',
      params: [],
      value: 'Ada Lovelace',
    });
  });

  it('upper-cases the name and reads a group prefix', () => {
    const property = parseProperty('item1.tel;type=work:555');
    expect(property?.group).toBe('item1');
    expect(property?.name).toBe('TEL');
  });

  it('reads the 3.0 comma list of types', () => {
    expect(parseProperty('TEL;TYPE=WORK,VOICE:555')?.params).toEqual([
      { name: 'TYPE', values: ['WORK', 'VOICE'] },
    ]);
  });

  it('reads the 4.0 quoted list of types', () => {
    expect(parseProperty('TEL;TYPE="work,voice":555')?.params).toEqual([
      { name: 'TYPE', values: ['work', 'voice'] },
    ]);
  });

  it('reads the 2.1 shorthand where a bare parameter is a type', () => {
    expect(parseProperty('TEL;WORK;VOICE:555')?.params).toEqual([
      { name: 'TYPE', values: ['WORK'] },
      { name: 'TYPE', values: ['VOICE'] },
    ]);
  });

  it('ignores a colon inside a quoted parameter', () => {
    const property = parseProperty('KEY;LABEL="a:b":value');
    expect(property?.params).toEqual([{ name: 'LABEL', values: ['a:b'] }]);
    expect(property?.value).toBe('value');
  });

  it('keeps the colons inside a value', () => {
    expect(parseProperty('URL:https://example.com:8080/x')?.value).toBe(
      'https://example.com:8080/x',
    );
  });

  it('returns null for a line with no colon', () => {
    expect(parseProperty('NOT A PROPERTY')).toBeNull();
  });

  it('returns null when the name is empty', () => {
    expect(parseProperty(':value')).toBeNull();
  });
});

describe('escaping', () => {
  it('round-trips the four escapes', () => {
    const value = 'a,b;c\\d\ne';
    expect(unescapeText(escapeText(value))).toBe(value);
  });

  it('reads \\N as a newline, which 3.0 exporters write', () => {
    expect(unescapeText('one\\Ntwo')).toBe('one\ntwo');
  });

  it('leaves a trailing lone backslash alone', () => {
    expect(unescapeText('end\\')).toBe('end\\');
  });

  it('splits a structured value on unescaped semicolons only', () => {
    expect(splitStructured('Doe;John\\;the third;;;')).toEqual([
      'Doe',
      'John;the third',
      '',
      '',
      '',
    ]);
  });

  it('splits a list value on unescaped commas only', () => {
    expect(splitList('Friends,Cycling\\, road,Work')).toEqual(['Friends', 'Cycling, road', 'Work']);
  });

  it('normalises CRLF inside a value to one newline', () => {
    expect(escapeText('a\r\nb')).toBe('a\\nb');
  });
});

describe('folding', () => {
  it('keeps every physical line inside 75 octets', () => {
    const folded = foldLine(`NOTE:${'x'.repeat(400)}`);
    for (const line of folded.split('\r\n')) expect(utf8Bytes(line)).toBeLessThanOrEqual(75);
  });

  it('does not split a multi-byte character', () => {
    const folded = foldLine(`NOTE:${'é'.repeat(100)}`);
    expect(folded.replace(/\r\n /g, '')).toBe(`NOTE:${'é'.repeat(100)}`);
    for (const line of folded.split('\r\n')) expect(utf8Bytes(line)).toBeLessThanOrEqual(75);
  });

  it('leaves a short line alone', () => {
    expect(foldLine('FN:Ada')).toBe('FN:Ada');
  });

  it('is undone by unfolding', () => {
    const line = `NOTE:${'word '.repeat(60)}`;
    expect(unfold(foldLine(line))).toEqual([line]);
  });
});

describe('reading a vCard 3.0 card', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Lovelace;Augusta;Ada;Ms.;',
    'FN:Ada Lovelace',
    'NICKNAME:Ada',
    'ORG:Analytical Engine;Research',
    'TITLE:Mathematician',
    'TEL;TYPE=WORK,VOICE:+44 20 7946 0018',
    'TEL;TYPE=CELL:+44 7700 900461',
    'EMAIL;TYPE=INTERNET,HOME:ada@example.org',
    'ADR;TYPE=HOME:;;12 Marylebone Rd;London;;NW1 5JD;United Kingdom',
    'URL;TYPE=WORK:https://example.org',
    'BDAY:1815-12-10',
    'NOTE:First programmer.\\nWrote note G.',
    'CATEGORIES:Friends,Work',
    'END:VCARD',
  ].join('\r\n');

  const [contact] = parseVcards(card, { now: NOW, makeId: () => 'generated' });

  it('reads the name, with the middle name kept on the given name', () => {
    expect(contact?.given).toBe('Augusta Ada');
    expect(contact?.family).toBe('Lovelace');
  });

  it('joins the organisation units', () => {
    expect(contact?.organisation).toBe('Analytical Engine, Research');
  });

  it('labels the phones and drops the types that only say "voice"', () => {
    expect(contact?.phones).toEqual([
      { label: 'work', value: '+44 20 7946 0018' },
      { label: 'mobile', value: '+44 7700 900461' },
    ]);
  });

  it('drops INTERNET from the email label', () => {
    expect(contact?.emails).toEqual([{ label: 'home', value: 'ada@example.org' }]);
  });

  it('reads the address components', () => {
    expect(contact?.addresses).toEqual([
      {
        label: 'home',
        street: '12 Marylebone Rd',
        city: 'London',
        region: '',
        postcode: 'NW1 5JD',
        country: 'United Kingdom',
      },
    ]);
  });

  it('reads the birthday, the note and the categories', () => {
    expect(contact?.birthday).toBe('1815-12-10');
    expect(contact?.notes).toBe('First programmer.\nWrote note G.');
    expect(contact?.groups).toEqual(['Friends', 'Work']);
  });

  it('invents an id when the card carries no UID', () => {
    expect(contact?.id).toBe('generated');
  });
});

describe('reading a vCard 4.0 card', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'KIND:individual',
    'FN:Grace Hopper',
    'N:Hopper;Grace;;;',
    'TEL;VALUE=uri;TYPE="work,voice";PREF=1:tel:+1-555-0143;ext=12',
    'EMAIL;TYPE=work:grace@example.mil',
    'BDAY:19061209',
    'UID:urn:uuid:9f4a-1',
    'END:VCARD',
  ].join('\r\n');

  const [contact] = parseVcards(card, { now: NOW });

  it('strips the tel: scheme and the URI parameters', () => {
    expect(contact?.phones).toEqual([{ label: 'work', value: '+1-555-0143' }]);
  });

  it('reads the basic-format birthday', () => {
    expect(contact?.birthday).toBe('1906-12-09');
  });

  it('keeps the UID as the record id', () => {
    expect(contact?.id).toBe('urn:uuid:9f4a-1');
  });
});

describe('grouped labels', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Bell Labs',
    'ORG:Bell Labs',
    'item1.TEL:+1 555 0100',
    'item1.X-ABLabel:Switchboard',
    'item2.TEL;TYPE=WORK:+1 555 0101',
    'item2.X-ABLabel:_$!<Home>!$_',
    'END:VCARD',
  ].join('\r\n');

  const [contact] = parseVcards(card, { now: NOW });

  it('prefers the grouped label over TYPE', () => {
    expect(contact?.phones).toEqual([
      { label: 'switchboard', value: '+1 555 0100' },
      { label: 'home', value: '+1 555 0101' },
    ]);
  });

  it('does not split an organisation name out of FN', () => {
    expect(contact?.given).toBe('');
    expect(contact?.family).toBe('');
    expect(contact?.organisation).toBe('Bell Labs');
  });
});

describe('reading a file', () => {
  it('reads every card in it', () => {
    const file = `${serialiseVcard(make({ id: 'a', given: 'A' }))}${serialiseVcard(
      make({ id: 'b', given: 'B' }),
    )}`;
    expect(parseVcards(file, { now: NOW }).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('ignores anything outside BEGIN and END', () => {
    const file = ['FN:Stray', 'BEGIN:VCARD', 'FN:Real', 'END:VCARD', 'FN:Also stray'].join('\r\n');
    const contacts = parseVcards(file, { now: NOW });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.given).toBe('Real');
  });

  it('drops a card that never ends', () => {
    expect(parseVcards('BEGIN:VCARD\r\nFN:Half\r\n', { now: NOW })).toEqual([]);
  });

  it('reads a name out of FN when there is no N', () => {
    const contact = parseVcards('BEGIN:VCARD\r\nFN:Alan Turing\r\nEND:VCARD', { now: NOW })[0];
    expect(contact?.given).toBe('Alan');
    expect(contact?.family).toBe('Turing');
  });

  it('refuses an embedded photo, which has no path to live at', () => {
    const card = ['BEGIN:VCARD', 'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRg', 'END:VCARD'].join(
      '\r\n',
    );
    expect(parseVcards(card, { now: NOW })[0]?.photo).toBeNull();
  });

  it('takes the timestamps from REV when the card has them', () => {
    const card = ['BEGIN:VCARD', 'FN:X', 'REV:20200102T030405Z', 'END:VCARD'].join('\r\n');
    expect(parseVcards(card, { now: NOW })[0]?.updatedAt).toBe(Date.UTC(2020, 0, 2, 3, 4, 5));
  });

  it('falls back to the given instant when it has none', () => {
    expect(parseVcards('BEGIN:VCARD\r\nFN:X\r\nEND:VCARD', { now: NOW })[0]?.createdAt).toBe(NOW);
  });
});

describe('parseVcardDate', () => {
  it.each([
    ['1815-12-10', '1815-12-10'],
    ['18151210', '1815-12-10'],
    ['1815-12-10T00:00:00Z', '1815-12-10'],
    ['--1210', ''],
    ['not a date', ''],
    ['1815-13-10', ''],
  ])('reads %s as %s', (input, expected) => {
    expect(parseVcardDate(input)).toBe(expected);
  });
});

describe('writing', () => {
  it('writes the version it was asked for', () => {
    expect(lines(serialiseVcard(make(), { version: '3.0' }))[1]).toBe('VERSION:3.0');
    expect(lines(serialiseVcard(make(), { version: '4.0' }))[1]).toBe('VERSION:4.0');
  });

  it('spells the type upper case for 3.0 and lower case for 4.0', () => {
    const contact = make({ phones: [{ label: 'work', value: '555' }] });
    expect(serialiseVcard(contact, { version: '3.0' })).toContain('TEL;TYPE=WORK:555');
    expect(serialiseVcard(contact, { version: '4.0' })).toContain('TEL;TYPE=work:555');
  });

  it('writes a mobile as CELL, which is what the format calls it', () => {
    const contact = make({ phones: [{ label: 'mobile', value: '555' }] });
    expect(serialiseVcard(contact, { version: '4.0' })).toContain('TEL;TYPE=cell:555');
  });

  it('quotes a label that would otherwise break the parameter', () => {
    const contact = make({ phones: [{ label: 'ski club', value: '555' }] });
    expect(serialiseVcard(contact, { version: '4.0' })).toContain('TEL;TYPE="ski club":555');
  });

  it('writes the birthday basic in 4.0 and extended in 3.0', () => {
    const contact = make({ birthday: '1815-12-10' });
    expect(serialiseVcard(contact, { version: '4.0' })).toContain('BDAY:18151210');
    expect(serialiseVcard(contact, { version: '3.0' })).toContain('BDAY:1815-12-10');
  });

  it('leaves out the properties a contact has nothing for', () => {
    const text = serialiseVcard(make());
    expect(text).not.toContain('ORG:');
    expect(text).not.toContain('BDAY:');
    expect(text).not.toContain('NOTE:');
    expect(text).not.toContain('CATEGORIES:');
  });

  it('escapes the separators inside a value', () => {
    const contact = make({ organisation: 'Smith, Jones; Co' });
    expect(serialiseVcard(contact)).toContain('ORG:Smith\\, Jones\\; Co');
  });

  it('writes one card per contact', () => {
    const text = serialiseVcards([make({ id: 'a' }), make({ id: 'b' })]);
    expect(text.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(text.endsWith('END:VCARD\r\n')).toBe(true);
  });
});

describe('round trip', () => {
  const cases: Array<[string, Contact]> = [
    ['an empty contact', make()],
    [
      'a full contact',
      make({
        id: 'urn:uuid:2f1a',
        given: 'Ada',
        family: 'Lovelace',
        nickname: 'Ada, the Countess',
        organisation: 'Analytical Engine, Research',
        title: 'Mathematician',
        emails: [
          { label: 'home', value: 'ada@example.org' },
          { label: '', value: 'countess@example.org' },
        ],
        phones: [
          { label: 'mobile', value: '+44 7700 900461' },
          { label: 'ski club', value: '(020) 7946-0018' },
        ],
        addresses: [
          {
            label: 'work',
            street: '12 Marylebone Rd',
            city: 'London',
            region: 'Greater London',
            postcode: 'NW1 5JD',
            country: 'United Kingdom',
          },
        ],
        urls: [{ label: 'work', value: 'https://example.org/~ada?q=1' }],
        birthday: '1815-12-10',
        notes: 'Note G.\nSemicolons; commas, backslashes \\ and all.',
        favourite: true,
        groups: ['Friends', 'Cycling, road'],
        photo: '/home/ada/Pictures/ada.png',
        createdAt: Date.UTC(2025, 0, 1, 9, 30, 0, 250),
        updatedAt: Date.UTC(2026, 5, 2, 11, 45, 12, 875),
      }),
    ],
    [
      'a company with no personal name',
      make({
        id: 'org-1',
        organisation: 'Bell Labs',
        urls: [{ label: '', value: 'bell.example' }],
      }),
    ],
    [
      'a name that needs more than one folded line',
      make({ id: 'long-1', given: 'Ana', family: 'Ø'.repeat(60), notes: 'ü'.repeat(200) }),
    ],
  ];

  for (const version of VCARD_VERSIONS) {
    describe(`in ${version}`, () => {
      it.each(cases)('gives back an equal contact for %s', (_name, contact) => {
        const text = serialiseVcard(contact, { version });
        const [parsed] = parseVcards(text, { now: 0, makeId: () => 'unused' });
        expect(parsed).toEqual(contact);
      });
    });
  }

  it('survives a second trip unchanged', () => {
    const contact = cases[1]?.[1] as Contact;
    const once = serialiseVcard(contact);
    const twice = serialiseVcard(parseVcards(once, { now: 0 })[0] as Contact);
    expect(twice).toBe(once);
  });
});

import { describe, expect, it } from 'vitest';
import { type Contact, emptyContact } from './contact';
import {
  compareContacts,
  displayName,
  initials,
  SECTION_LETTERS,
  SECTION_OTHER,
  sectionize,
  sectionOf,
  sectionsPresent,
  sortContacts,
  sortName,
} from './sort';

const NOW = Date.UTC(2026, 8, 5);
let seq = 0;

function person(given: string, family: string, organisation = ''): Contact {
  seq += 1;
  return { ...emptyContact(`c${seq}`, NOW), given, family, organisation };
}

const names = (contacts: readonly Contact[]) => contacts.map((c) => displayName(c));

describe('displayName', () => {
  it('joins the given and family names', () => {
    expect(displayName(person('Ada', 'Lovelace'))).toBe('Ada Lovelace');
  });

  it('uses whichever name there is', () => {
    expect(displayName(person('Prince', ''))).toBe('Prince');
    expect(displayName(person('', 'Lovelace'))).toBe('Lovelace');
  });

  it('falls back to the organisation for a company card', () => {
    expect(displayName(person('', '', 'Bell Labs'))).toBe('Bell Labs');
  });

  it('is empty when a card holds no name at all', () => {
    expect(displayName(person('', ''))).toBe('');
  });

  it('collapses the gap left by a missing name', () => {
    expect(displayName({ given: ' Ada ', family: ' Lovelace ', organisation: '' })).toBe(
      'Ada Lovelace',
    );
  });
});

describe('sortName', () => {
  it('leads with the given name when sorting by first', () => {
    expect(sortName(person('Ada', 'Lovelace'), 'first')).toBe('Ada Lovelace');
  });

  it('leads with the family name when sorting by last', () => {
    expect(sortName(person('Ada', 'Lovelace'), 'last')).toBe('Lovelace Ada');
  });

  it('uses the organisation when there is no personal name', () => {
    expect(sortName(person('', '', 'Bell Labs'), 'last')).toBe('Bell Labs');
  });

  it('leaves no leading space when half the name is missing', () => {
    expect(sortName(person('', 'Lovelace'), 'first')).toBe('Lovelace');
    expect(sortName(person('Ada', ''), 'last')).toBe('Ada');
  });
});

describe('sorting', () => {
  it('orders by given name, then family name', () => {
    const list = [person('Ada', 'Zeta'), person('Ada', 'Alpha'), person('Bob', 'Alpha')];
    expect(names(sortContacts(list, 'first'))).toEqual(['Ada Alpha', 'Ada Zeta', 'Bob Alpha']);
  });

  it('orders by family name when asked', () => {
    const list = [person('Ada', 'Zeta'), person('Bob', 'Alpha')];
    expect(names(sortContacts(list, 'last'))).toEqual(['Bob Alpha', 'Ada Zeta']);
  });

  it('is case-insensitive', () => {
    const list = [person('bob', ''), person('Ada', '')];
    expect(names(sortContacts(list, 'first'))).toEqual(['Ada', 'bob']);
  });

  it('files an accented name where the language puts it, not where its code point does', () => {
    const list = [person('Zoe', ''), person('Ängström', ''), person('Ana', '')];
    expect(names(sortContacts(list, 'first', 'en'))).toEqual(['Ana', 'Ängström', 'Zoe']);
  });

  it('follows the locale when two locales disagree', () => {
    const list = [person('Ärlig', ''), person('Bo', '')];
    expect(names(sortContacts(list, 'first', 'en'))).toEqual(['Ärlig', 'Bo']);
    // Swedish files Ä after Z.
    expect(names(sortContacts(list, 'first', 'sv'))).toEqual(['Bo', 'Ärlig']);
  });

  it('compares digits by value rather than by character', () => {
    const list = [person('', '', '10 Downing'), person('', '', '9 Downing')];
    expect(names(sortContacts(list, 'first'))).toEqual(['9 Downing', '10 Downing']);
  });

  it('puts names outside A–Z after the letters', () => {
    const list = [person('Zoe', ''), person('', '', '3M'), person('Ada', '')];
    expect(names(sortContacts(list, 'first'))).toEqual(['Ada', 'Zoe', '3M']);
  });

  it('breaks a complete tie on the id so the list never shuffles', () => {
    const a: Contact = { ...person('Ada', 'Lovelace'), id: 'b' };
    const b: Contact = { ...person('Ada', 'Lovelace'), id: 'a' };
    expect(sortContacts([a, b], 'first').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('does not disturb the array it was given', () => {
    const list = [person('Zoe', ''), person('Ada', '')];
    sortContacts(list, 'first');
    expect(names(list)).toEqual(['Zoe', 'Ada']);
  });
});

describe('the A–Z index', () => {
  it('runs A to Z and ends with the other bucket', () => {
    expect(SECTION_LETTERS).toHaveLength(27);
    expect(SECTION_LETTERS[0]).toBe('A');
    expect(SECTION_LETTERS[25]).toBe('Z');
    expect(SECTION_LETTERS[26]).toBe(SECTION_OTHER);
  });

  it.each([
    ['Ada', 'A'],
    ['ada', 'A'],
    ['Ángel', 'A'],
    ['Ørsted', 'O'],
    ['Łukasz', 'L'],
    ['Étienne', 'E'],
    ['3M', '#'],
    ['+1 Design', '#'],
    ['Ласло', '#'],
    ['', '#'],
    ['   ', '#'],
  ])('files %s under %s', (name, letter) => {
    expect(sectionOf(name)).toBe(letter);
  });

  it('cuts the sorted list into sections in list order', () => {
    const list = [person('Bo', ''), person('Ada', ''), person('', '', '3M'), person('Ann', '')];
    const sections = sectionize(list, 'first');
    expect(sections.map((s) => s.letter)).toEqual(['A', 'B', '#']);
    expect(names(sections[0]?.contacts ?? [])).toEqual(['Ada', 'Ann']);
  });

  it('sections on the family name when sorting by last name', () => {
    const sections = sectionize([person('Ada', 'Zeta')], 'last');
    expect(sections.map((s) => s.letter)).toEqual(['Z']);
  });

  it('reports which letters the rail can reach', () => {
    const sections = sectionize([person('Ada', ''), person('Zoe', '')], 'first');
    expect(sectionsPresent(sections)).toEqual(new Set(['A', 'Z']));
  });

  it('has no sections for an empty book', () => {
    expect(sectionize([], 'first')).toEqual([]);
  });
});

describe('initials', () => {
  it('takes one letter from each name', () => {
    expect(initials(person('Ada', 'Lovelace'))).toBe('AL');
  });

  it('takes two words of the organisation when there is no name', () => {
    expect(initials(person('', '', 'Bell Labs Research'))).toBe('BL');
  });

  it('is empty when there is nothing to take', () => {
    expect(initials(person('', ''))).toBe('');
  });

  it('handles a name that starts outside the basic plane', () => {
    expect(initials(person('Ω', 'x'))).toBe('ΩX');
  });
});

describe('compareContacts', () => {
  it('is symmetric', () => {
    const a = person('Ada', '');
    const b = person('Bo', '');
    expect(compareContacts(a, b, 'first')).toBeLessThan(0);
    expect(compareContacts(b, a, 'first')).toBeGreaterThan(0);
  });
});

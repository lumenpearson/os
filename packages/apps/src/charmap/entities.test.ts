import { describe, expect, it } from 'vitest';
import { isDisplayable } from './chars';
import { ENTITY_COUNT, entityCodePoint, entityName, namedEntity } from './entities';

describe('the entity table', () => {
  it('names the characters people write markup for', () => {
    expect(namedEntity(0x2014)).toBe('&mdash;');
    expect(namedEntity(0x00a0)).toBe('&nbsp;');
    expect(namedEntity(0x20ac)).toBe('&euro;');
    expect(namedEntity(0x2026)).toBe('&hellip;');
    expect(namedEntity(0x00a9)).toBe('&copy;');
    expect(namedEntity(0x03bb)).toBe('&lambda;');
  });

  it('says nothing for a character it does not name', () => {
    expect(entityName(0x2500)).toBeNull();
    expect(namedEntity(0x1d400)).toBeNull();
    expect(namedEntity(0x4e00)).toBeNull();
  });

  it('reads back the other way, case sensitively', () => {
    expect(entityCodePoint('mdash')).toBe(0x2014);
    expect(entityCodePoint('Dagger')).toBe(0x2021);
    expect(entityCodePoint('dagger')).toBe(0x2020);
    expect(entityCodePoint('MDASH')).toBeNull();
    expect(entityCodePoint('nonesuch')).toBeNull();
  });

  it('gives every character one name and every name one character', () => {
    const codePoints = new Set<number>();
    const names = new Set<string>();
    for (let cp = 0; cp <= 0x2700; cp += 1) {
      const name = entityName(cp);
      if (name === null) continue;
      expect(codePoints.has(cp)).toBe(false);
      expect(names.has(name), name).toBe(false);
      codePoints.add(cp);
      names.add(name);
      expect(entityCodePoint(name)).toBe(cp);
    }
    expect(codePoints.size).toBe(ENTITY_COUNT);
  });

  it('names only characters that exist', () => {
    for (let cp = 0; cp <= 0x2700; cp += 1) {
      if (entityName(cp) === null) continue;
      expect(isDisplayable(cp), cp.toString(16)).toBe(true);
    }
  });

  it('spells the entity names with letters only, as HTML requires', () => {
    for (let cp = 0; cp <= 0x2700; cp += 1) {
      const name = entityName(cp);
      if (name === null) continue;
      expect(name, name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  baseUnit,
  CATEGORIES,
  CATEGORY_IDS,
  categoryById,
  categoryOf,
  DEFAULT_PAIR,
  isCategoryId,
  sameCategory,
  stepCategory,
  UNITS,
  unitById,
  unitIn,
  unitsIn,
} from './catalogue';

describe('the catalogue', () => {
  it('covers the fourteen kinds of quantity the app claims', () => {
    expect(CATEGORY_IDS).toEqual([
      'length',
      'mass',
      'area',
      'volume',
      'temperature',
      'time',
      'speed',
      'data',
      'angle',
      'pressure',
      'energy',
      'power',
      'frequency',
      'fuel',
    ]);
  });

  it('gives every unit a unique id', () => {
    const ids = UNITS.map((unit) => unit.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prefixes every unit id with the category it is in', () => {
    for (const unit of UNITS) {
      expect(unit.id.startsWith(`${unit.category}.`)).toBe(true);
    }
  });

  it('gives every unit a name and a symbol', () => {
    for (const unit of UNITS) {
      expect(unit.name.trim()).not.toBe('');
      expect(unit.symbol.trim()).not.toBe('');
    }
  });

  it('puts at least two units in every category', () => {
    for (const id of CATEGORY_IDS) {
      expect(unitsIn(id).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every category exactly one base unit of its own', () => {
    for (const category of CATEGORIES) {
      const base = baseUnit(category.id);
      expect(base.category).toBe(category.id);
      expect(base.id).toBe(category.base);
      const identities = unitsIn(category.id).filter(
        (unit) =>
          (unit.scale.kind === 'factor' && unit.scale.factor === 1) ||
          (unit.scale.kind === 'affine' && unit.scale.scale === 1 && unit.scale.offset === 0),
      );
      expect(identities.map((unit) => unit.id)).toEqual([category.base]);
    }
  });

  it('never uses a factor of zero or a negative one', () => {
    for (const unit of UNITS) {
      if (unit.scale.kind === 'factor') expect(unit.scale.factor).toBeGreaterThan(0);
      if (unit.scale.kind === 'reciprocal') expect(unit.scale.constant).toBeGreaterThan(0);
      if (unit.scale.kind === 'affine') expect(unit.scale.scale).toBeGreaterThan(0);
    }
  });

  it('opens every category on a pair drawn from that category', () => {
    for (const id of CATEGORY_IDS) {
      const [from, to] = DEFAULT_PAIR[id];
      expect(categoryOf(from)).toBe(id);
      expect(categoryOf(to)).toBe(id);
      expect(from).not.toBe(to);
    }
  });

  it('uses an affine scale for temperature and nothing else', () => {
    for (const unit of UNITS) {
      if (unit.category === 'temperature') expect(unit.scale.kind).toBe('affine');
      else expect(unit.scale.kind).not.toBe('affine');
    }
  });

  it('uses a reciprocal scale only in fuel economy, and not for all of it', () => {
    const reciprocals = UNITS.filter((unit) => unit.scale.kind === 'reciprocal');
    expect(reciprocals.length).toBeGreaterThan(0);
    for (const unit of reciprocals) expect(unit.category).toBe('fuel');
    // Litres per 100 km is a consumption, so it stays linear.
    expect(unitById('fuel.litre-per-100km')?.scale.kind).toBe('factor');
    expect(unitById('fuel.gallon-us-per-100mi')?.scale.kind).toBe('factor');
  });
});

describe('the units that differ by country', () => {
  const pairs: Array<[string, string]> = [
    ['volume.gallon-us', 'volume.gallon-imp'],
    ['volume.pint-us', 'volume.pint-imp'],
    ['volume.quart-us', 'volume.quart-imp'],
    ['volume.fluid-ounce-us', 'volume.fluid-ounce-imp'],
    ['mass.short-ton', 'mass.long-ton'],
    ['fuel.mpg-us', 'fuel.mpg-imp'],
  ];

  it('keeps both members of every ambiguous pair', () => {
    for (const [us, imperial] of pairs) {
      expect(unitById(us)).toBeDefined();
      expect(unitById(imperial)).toBeDefined();
    }
  });

  it('names each of them for the country, so neither is the plain word', () => {
    for (const [us, imperial] of pairs) {
      expect(unitById(us)?.name).toMatch(/US|Miles per US/);
      expect(unitById(imperial)?.name).toMatch(/[Ii]mperial/);
    }
  });

  it('gives them different sizes', () => {
    for (const [us, imperial] of pairs) {
      const left = unitById(us);
      const right = unitById(imperial);
      if (left?.scale.kind === 'factor' && right?.scale.kind === 'factor') {
        expect(left.scale.factor).not.toBe(right.scale.factor);
      }
      if (left?.scale.kind === 'reciprocal' && right?.scale.kind === 'reciprocal') {
        expect(left.scale.constant).not.toBe(right.scale.constant);
      }
    }
  });
});

describe('looking a unit up', () => {
  it('finds one by id and answers undefined for anything else', () => {
    expect(unitById('length.metre')?.symbol).toBe('m');
    expect(unitById('length.smoot')).toBeUndefined();
    expect(unitById('')).toBeUndefined();
  });

  it('reports the category a unit is in', () => {
    expect(categoryOf('temperature.celsius')).toBe('temperature');
    expect(categoryOf('nothing')).toBeNull();
  });

  it('says whether two units can be converted between at all', () => {
    expect(sameCategory('length.metre', 'length.mile')).toBe(true);
    expect(sameCategory('length.metre', 'mass.gram')).toBe(false);
    expect(sameCategory('length.metre', 'nothing')).toBe(false);
  });

  it('falls back to the base unit for an id the category does not have', () => {
    expect(unitIn('length', 'length.foot').id).toBe('length.foot');
    expect(unitIn('length', 'mass.gram').id).toBe('length.metre');
    expect(unitIn('fuel', 'gone').id).toBe('fuel.litre-per-100km');
  });

  it('recognises a category id', () => {
    expect(isCategoryId('length')).toBe(true);
    expect(isCategoryId('lengths')).toBe(false);
    expect(isCategoryId(7)).toBe(false);
    expect(categoryById('mass')?.name).toBe('Mass');
  });
});

describe('stepping between categories', () => {
  it('moves one along in either direction', () => {
    expect(stepCategory('length', 1)).toBe('mass');
    expect(stepCategory('mass', -1)).toBe('length');
  });

  it('wraps at both ends rather than sticking', () => {
    expect(stepCategory('fuel', 1)).toBe('length');
    expect(stepCategory('length', -1)).toBe('fuel');
  });

  it('walks the whole list and comes back', () => {
    let id = CATEGORY_IDS[0] ?? 'length';
    for (let step = 0; step < CATEGORY_IDS.length; step += 1) id = stepCategory(id, 1);
    expect(id).toBe(CATEGORY_IDS[0]);
  });
});

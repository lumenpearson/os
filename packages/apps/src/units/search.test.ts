import { describe, expect, it } from 'vitest';
import { UNITS, type Unit, unitById, unitsIn } from './catalogue';
import { fold, rankUnit, searchUnits } from './search';

const length = unitsIn('length');
const volume = unitsIn('volume');
const speed = unitsIn('speed');
const area = unitsIn('area');
const data = unitsIn('data');

const ids = (units: readonly Unit[]) => units.map((unit) => unit.id);
const first = (units: readonly Unit[], query: string) => searchUnits(units, query)[0]?.id;

function unit(id: string): Unit {
  const found = unitById(id);
  if (!found) throw new Error(`no unit ${id}`);
  return found;
}

describe('folding', () => {
  it('drops case, punctuation and spacing', () => {
    expect(fold('Miles per hour')).toBe('milesperhour');
    expect(fold('m/s')).toBe('ms');
    expect(fold('ft·lb')).toBe('ftlb');
    expect(fold('L/100 km')).toBe('l100km');
  });

  it('folds superscripts down so ft2 can find ft²', () => {
    expect(fold('ft²')).toBe('ft2');
    expect(fold('cm³')).toBe('cm3');
    expect(fold('ft2')).toBe('ft2');
  });

  it('folds accents and the micro sign', () => {
    expect(fold('Ångström')).toBe('angstrom');
    expect(fold('µm')).toBe('um');
    expect(fold('°C')).toBe('c');
  });
});

describe('an empty query', () => {
  it('is the whole list, in catalogue order', () => {
    expect(ids(searchUnits(length, ''))).toEqual(ids(length));
    expect(ids(searchUnits(length, '   '))).toEqual(ids(length));
  });

  it('is capped by the limit', () => {
    expect(searchUnits(length, '', 3)).toHaveLength(3);
  });
});

describe('ranking', () => {
  it('puts an exact symbol first, ahead of longer names that contain it', () => {
    expect(first(length, 'm')).toBe('length.metre');
    expect(first(length, 'mi')).toBe('length.mile');
    expect(first(length, 'in')).toBe('length.inch');
    expect(first(area, 'ha')).toBe('area.hectare');
  });

  it('puts an exact name ahead of a prefix of another name', () => {
    expect(first(length, 'metre')).toBe('length.metre');
    expect(first(volume, 'litre')).toBe('volume.litre');
  });

  it('finds a unit by an alternative spelling', () => {
    expect(first(length, 'meter')).toBe('length.metre');
    expect(first(volume, 'liter')).toBe('volume.litre');
    expect(first(length, 'micron')).toBe('length.micrometre');
    expect(first(length, 'feet')).toBe('length.foot');
    expect(first(speed, 'kph')).toBe('speed.kilometre-per-hour');
  });

  it('matches the start of any word in a name', () => {
    expect(first(volume, 'gallon')).toBe('volume.gallon-us');
    expect(ids(searchUnits(volume, 'imperial'))).toEqual([
      'volume.fluid-ounce-imp',
      'volume.pint-imp',
      'volume.quart-imp',
      'volume.gallon-imp',
    ]);
  });

  it('breaks ties on catalogue order, so the smaller unit comes first', () => {
    expect(ids(searchUnits(length, 'metre')).slice(0, 3)).toEqual([
      'length.metre',
      'length.nanometre',
      'length.micrometre',
    ]);
  });

  it('finds units whose symbols use superscripts', () => {
    expect(first(area, 'ft2')).toBe('area.square-foot');
    expect(first(area, 'm2')).toBe('area.square-metre');
    expect(first(volume, 'cm3')).toBe('volume.cubic-centimetre');
  });

  it('keeps the two binary and decimal families apart when asked for one', () => {
    expect(first(data, 'gib')).toBe('data.gibibyte');
    expect(first(data, 'gb')).toBe('data.gigabyte');
    expect(first(data, 'kib')).toBe('data.kibibyte');
    expect(first(data, 'kb')).toBe('data.kilobyte');
  });

  it('finds nothing for a query nothing answers to', () => {
    expect(searchUnits(length, 'zzz')).toEqual([]);
    expect(searchUnits(length, 'smoot')).toEqual([]);
  });

  it('is case and punctuation blind', () => {
    expect(first(speed, 'M/S')).toBe('speed.metre-per-second');
    expect(first(speed, 'km/h')).toBe('speed.kilometre-per-hour');
    expect(first(speed, 'kmh')).toBe('speed.kilometre-per-hour');
  });
});

describe('one unit against one query', () => {
  it('scores an exact symbol better than an exact name', () => {
    const metre = unit('length.metre');
    expect(rankUnit(metre, 'm')).toBeLessThan(rankUnit(metre, 'metre') ?? 99);
  });

  it('reads the case of a symbol, because the SI prefixes do', () => {
    const power = unitsIn('power');
    expect(first(power, 'MW')).toBe('power.megawatt');
    expect(first(power, 'mW')).toBe('power.milliwatt');
    expect(rankUnit(unit('power.megawatt'), 'MW')).toBeLessThan(
      rankUnit(unit('power.milliwatt'), 'MW') ?? 99,
    );
  });

  it('scores a prefix better than a match in the middle', () => {
    const nautical = unit('length.nautical-mile');
    const prefix = rankUnit(nautical, 'naut') ?? 99;
    const inside = rankUnit(nautical, 'ical') ?? 99;
    expect(prefix).toBeLessThan(inside);
  });

  it('answers null when the unit does not match at all', () => {
    expect(rankUnit(unit('length.metre'), 'gallon')).toBeNull();
  });

  it('matches everything on an empty query', () => {
    for (const u of UNITS) expect(rankUnit(u, '')).toBe(0);
  });
});

describe('every unit in the catalogue', () => {
  it('can be found by its own name', () => {
    for (const u of UNITS) {
      const found = searchUnits(unitsIn(u.category), u.name);
      expect(found[0]?.id, `searching for ${u.name}`).toBe(u.id);
    }
  });

  it('can be found by its own symbol wherever the symbol has letters in it', () => {
    for (const u of UNITS) {
      // The degree and the two arc marks are punctuation alone: they fold to
      // nothing, and their aliases are what makes them typeable.
      if (fold(u.symbol) === '') continue;
      const found = searchUnits(unitsIn(u.category), u.symbol);
      const top = found[0];
      expect(top, `searching for ${u.symbol}`).toBeDefined();
      // "gal", "pt" and "ton" name two units each; either may come first, but
      // the list has to offer both and lead with that symbol.
      expect(ids(found)).toContain(u.id);
      expect(top?.symbol).toBe(u.symbol);
    }
  });

  it('reaches the units whose symbols are punctuation through their words', () => {
    expect(fold('°')).toBe('');
    // The symbol still answers, exactly and on its own — it just cannot be
    // reached by a prefix, because there is nothing left of it to fold.
    expect(ids(searchUnits(unitsIn('angle'), '°'))).toEqual(['angle.degree']);
    expect(searchUnits(unitsIn('angle'), '/')).toEqual([]);
    expect(first(unitsIn('angle'), 'deg')).toBe('angle.degree');
    expect(first(unitsIn('angle'), 'arcmin')).toBe('angle.arcminute');
    expect(first(unitsIn('angle'), 'arcsec')).toBe('angle.arcsecond');
  });
});

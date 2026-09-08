import { describe, expect, it } from 'vitest';
import { UNITS, type Unit, unitById, unitsIn } from './catalogue';
import {
  convert,
  DEFAULT_PRECISION,
  formatQuantity,
  formatValue,
  fromBase,
  GROUP_SEPARATOR,
  groupDigits,
  parseValue,
  toBase,
} from './convert';

/** The unit with that id; the table below is only worth running if they exist. */
function unit(id: string): Unit {
  const found = unitById(id);
  if (!found) throw new Error(`no unit ${id}`);
  return found;
}

/** What the field would show, which is the claim a converter actually makes. */
const shown = (value: number, from: string, to: string): string => {
  const result = convert(value, from, to);
  return result === null ? 'null' : formatValue(result);
};

describe('the shape of a conversion', () => {
  it('refuses units from different categories', () => {
    expect(convert(1, 'length.metre', 'mass.kilogram')).toBeNull();
    expect(convert(1, 'temperature.celsius', 'time.second')).toBeNull();
  });

  it('refuses ids nothing answers to', () => {
    expect(convert(1, 'length.metre', 'length.smoot')).toBeNull();
    expect(convert(1, '', 'length.metre')).toBeNull();
  });

  it('refuses a value that is not a finite number', () => {
    expect(convert(Number.NaN, 'length.metre', 'length.foot')).toBeNull();
    expect(convert(Number.POSITIVE_INFINITY, 'length.metre', 'length.foot')).toBeNull();
  });

  it('leaves a unit converted to itself exactly alone', () => {
    expect(convert(0.1, 'length.metre', 'length.metre')).toBe(0.1);
    expect(convert(0, 'fuel.mpg-us', 'fuel.mpg-us')).toBe(0);
  });

  it('takes a value to the base unit and back for every unit in the catalogue', () => {
    for (const u of UNITS) {
      // 7 is arbitrary but away from the fixed points of every scale kind.
      expect(fromBase(toBase(7, u), u)).toBeCloseTo(7, 9);
    }
  });
});

describe('length, mass, area and volume', () => {
  const table: Array<[number, string, string, number]> = [
    [1, 'length.metre', 'length.foot', 3.280839895013123],
    [1, 'length.inch', 'length.centimetre', 2.54],
    [1, 'length.mile', 'length.kilometre', 1.609344],
    [26.2, 'length.mile', 'length.kilometre', 42.1648128],
    [1, 'length.nautical-mile', 'length.metre', 1852],
    [1, 'length.light-year', 'length.kilometre', 9460730472580.8],
    [1, 'mass.pound', 'mass.kilogram', 0.45359237],
    [1, 'mass.stone', 'mass.pound', 14],
    [1, 'mass.troy-ounce', 'mass.gram', 31.1034768],
    [1, 'mass.tonne', 'mass.kilogram', 1000],
    [1, 'area.acre', 'area.square-metre', 4046.8564224],
    [1, 'area.hectare', 'area.acre', 2.471053814671653],
    [1, 'area.square-mile', 'area.acre', 640],
    [1, 'volume.gallon-us', 'volume.litre', 3.785411784],
    [1, 'volume.gallon-imp', 'volume.litre', 4.54609],
    [1, 'volume.cup-us', 'volume.millilitre', 236.5882365],
    [1, 'volume.cubic-metre', 'volume.litre', 1000],
  ];
  for (const [value, from, to, expected] of table) {
    it(`converts ${value} ${from} to ${to}`, () => {
      expect(convert(value, from, to)).toBeCloseTo(expected, 9);
    });
  }
});

describe('the units that differ by country', () => {
  it('keeps the two gallons 20 % apart', () => {
    expect(convert(1, 'volume.gallon-imp', 'volume.gallon-us')).toBeCloseTo(1.200949925504855, 12);
    expect(convert(1, 'volume.gallon-us', 'volume.litre')).toBeCloseTo(3.785411784, 12);
    expect(convert(1, 'volume.gallon-imp', 'volume.litre')).toBeCloseTo(4.54609, 12);
  });

  it('keeps the two pints and the two fluid ounces apart', () => {
    expect(convert(1, 'volume.pint-us', 'volume.pint-imp')).toBeCloseTo(0.8326741846289888, 12);
    expect(convert(1, 'volume.fluid-ounce-us', 'volume.millilitre')).toBeCloseTo(29.5735295625, 9);
    expect(convert(1, 'volume.fluid-ounce-imp', 'volume.millilitre')).toBeCloseTo(28.4130625, 9);
  });

  it('keeps the US ton and the imperial ton apart', () => {
    expect(convert(1, 'mass.short-ton', 'mass.pound')).toBeCloseTo(2000, 9);
    expect(convert(1, 'mass.long-ton', 'mass.pound')).toBeCloseTo(2240, 9);
    expect(convert(1, 'mass.short-ton', 'mass.long-ton')).toBeCloseTo(0.8928571428571429, 12);
  });
});

describe('temperature, which is affine and not a factor', () => {
  it('does not send zero to zero', () => {
    expect(shown(0, 'temperature.celsius', 'temperature.fahrenheit')).toBe('32');
    expect(shown(0, 'temperature.celsius', 'temperature.kelvin')).toBe('273.15');
    expect(shown(0, 'temperature.fahrenheit', 'temperature.celsius')).toBe('-17.7777777778');
  });

  it('reads the fixed points of the two scales', () => {
    expect(shown(100, 'temperature.celsius', 'temperature.fahrenheit')).toBe('212');
    expect(shown(212, 'temperature.fahrenheit', 'temperature.celsius')).toBe('100');
    expect(shown(37, 'temperature.celsius', 'temperature.fahrenheit')).toBe('98.6');
    expect(shown(98.6, 'temperature.fahrenheit', 'temperature.celsius')).toBe('37');
  });

  it('meets the two scales at minus forty', () => {
    expect(shown(-40, 'temperature.celsius', 'temperature.fahrenheit')).toBe('-40');
    expect(shown(-40, 'temperature.fahrenheit', 'temperature.celsius')).toBe('-40');
  });

  it('puts absolute zero in the right place on all four scales', () => {
    expect(shown(0, 'temperature.kelvin', 'temperature.celsius')).toBe('-273.15');
    expect(shown(0, 'temperature.kelvin', 'temperature.fahrenheit')).toBe('-459.67');
    expect(shown(0, 'temperature.kelvin', 'temperature.rankine')).toBe('0');
    expect(shown(0, 'temperature.rankine', 'temperature.celsius')).toBe('-273.15');
  });

  it('lands on zero instead of on the rounding left by the subtraction', () => {
    // 459.67 °R is 0 °F exactly. Taking it through kelvin subtracts two
    // numbers that agree to fourteen digits; what survives is not a reading.
    expect(shown(459.67, 'temperature.rankine', 'temperature.fahrenheit')).toBe('0');
    expect(shown(273.15, 'temperature.kelvin', 'temperature.celsius')).toBe('0');
  });

  it('scales a degree the same way in Rankine and Fahrenheit', () => {
    expect(shown(491.67, 'temperature.rankine', 'temperature.fahrenheit')).toBe('32');
    expect(shown(671.67, 'temperature.rankine', 'temperature.fahrenheit')).toBe('212');
  });

  it('is not a proportion: doubling the input does not double the output', () => {
    const ten = convert(10, 'temperature.celsius', 'temperature.fahrenheit') ?? 0;
    const twenty = convert(20, 'temperature.celsius', 'temperature.fahrenheit') ?? 0;
    expect(twenty).not.toBeCloseTo(ten * 2, 6);
    expect(twenty - ten).toBeCloseTo(18, 9);
  });
});

describe('fuel economy, which is reciprocal and not linear', () => {
  it('turns miles per US gallon into litres per 100 km', () => {
    expect(convert(30, 'fuel.mpg-us', 'fuel.litre-per-100km')).toBeCloseTo(7.84048611111, 9);
    expect(convert(50, 'fuel.mpg-us', 'fuel.litre-per-100km')).toBeCloseTo(4.70429166667, 9);
    expect(convert(7.84048611111, 'fuel.litre-per-100km', 'fuel.mpg-us')).toBeCloseTo(30, 9);
  });

  it('keeps the US and imperial gallons apart here too', () => {
    expect(convert(30, 'fuel.mpg-imp', 'fuel.litre-per-100km')).toBeCloseTo(9.41603121106, 9);
    expect(convert(30, 'fuel.mpg-us', 'fuel.mpg-imp')).toBeCloseTo(36.0284977651, 9);
  });

  it('is reciprocal: better economy is a smaller consumption', () => {
    const thirty = convert(30, 'fuel.mpg-us', 'fuel.litre-per-100km') ?? 0;
    const sixty = convert(60, 'fuel.mpg-us', 'fuel.litre-per-100km') ?? 0;
    expect(sixty).toBeCloseTo(thirty / 2, 9);
    // The linear reading — 60 mpg meaning 60 L/100 km — is what this rules out.
    expect(sixty).not.toBeCloseTo(60, 6);
  });

  it('handles the linear member of the same category', () => {
    // Gallons per 100 miles is a consumption, so it is a factor, not a
    // reciprocal: 30 mpg is 100/30 gallons per hundred miles.
    expect(convert(30, 'fuel.mpg-us', 'fuel.gallon-us-per-100mi')).toBeCloseTo(3.33333333333, 9);
    expect(convert(1, 'fuel.gallon-us-per-100mi', 'fuel.litre-per-100km')).toBeCloseTo(
      2.35214583333,
      9,
    );
  });

  it('converts kilometres per litre both ways', () => {
    expect(convert(1, 'fuel.km-per-litre', 'fuel.litre-per-100km')).toBeCloseTo(100, 9);
    expect(convert(12.5, 'fuel.km-per-litre', 'fuel.litre-per-100km')).toBeCloseTo(8, 9);
    expect(convert(8, 'fuel.litre-per-100km', 'fuel.km-per-litre')).toBeCloseTo(12.5, 9);
  });

  it('has no finite answer for zero economy, and says so instead of printing one', () => {
    expect(convert(0, 'fuel.mpg-us', 'fuel.litre-per-100km')).toBeNull();
    expect(convert(0, 'fuel.litre-per-100km', 'fuel.mpg-us')).toBeNull();
    // A linear pair in the same category is untroubled by zero.
    expect(convert(0, 'fuel.litre-per-100km', 'fuel.gallon-us-per-100mi')).toBe(0);
  });
});

describe('data, where the two families must not be mixed', () => {
  it('keeps the decimal family on powers of ten', () => {
    expect(convert(1, 'data.kilobyte', 'data.byte')).toBe(1000);
    expect(convert(1, 'data.megabyte', 'data.kilobyte')).toBe(1000);
    expect(convert(1, 'data.terabyte', 'data.byte')).toBe(1e12);
  });

  it('keeps the binary family on powers of two', () => {
    expect(convert(1, 'data.kibibyte', 'data.byte')).toBe(1024);
    expect(convert(1, 'data.mebibyte', 'data.kibibyte')).toBe(1024);
    expect(convert(1, 'data.tebibyte', 'data.byte')).toBe(1024 ** 4);
  });

  it('converts between the families without pretending they are the same', () => {
    expect(convert(1, 'data.kilobyte', 'data.kibibyte')).toBeCloseTo(0.9765625, 12);
    expect(convert(1, 'data.gigabyte', 'data.gibibyte')).toBeCloseTo(0.9313225746154785, 12);
    expect(convert(1, 'data.terabyte', 'data.tebibyte')).toBeCloseTo(0.9094947017729282, 12);
  });

  it('counts eight bits to the byte', () => {
    expect(convert(1, 'data.byte', 'data.bit')).toBe(8);
    expect(convert(1, 'data.megabit', 'data.megabyte')).toBe(0.125);
  });
});

describe('the remaining categories', () => {
  const table: Array<[number, string, string, number]> = [
    [1, 'time.year', 'time.day', 365.2425],
    [1, 'time.month', 'time.day', 30.436875],
    [1, 'time.week', 'time.hour', 168],
    [1, 'speed.knot', 'speed.kilometre-per-hour', 1.852],
    [100, 'speed.kilometre-per-hour', 'speed.mile-per-hour', 62.1371192237334],
    [1, 'angle.turn', 'angle.degree', 360],
    [1, 'angle.degree', 'angle.arcsecond', 3600],
    [180, 'angle.degree', 'angle.radian', Math.PI],
    [1, 'pressure.bar', 'pressure.psi', 14.503773773020923],
    [1, 'pressure.atmosphere', 'pressure.torr', 760],
    [1, 'pressure.inhg', 'pressure.hectopascal', 33.86389],
    [1, 'energy.kilowatt-hour', 'energy.kilojoule', 3600],
    [1, 'energy.kilocalorie', 'energy.kilojoule', 4.184],
    [1, 'power.horsepower', 'power.kilowatt', 0.7456998715822701],
    [1, 'power.metric-horsepower', 'power.kilowatt', 0.73549875],
    [1, 'frequency.hertz', 'frequency.rpm', 60],
    [1, 'frequency.hertz', 'frequency.radian-per-second', 2 * Math.PI],
  ];
  for (const [value, from, to, expected] of table) {
    it(`converts ${value} ${from} to ${to}`, () => {
      expect(convert(value, from, to)).toBeCloseTo(expected, 9);
    });
  }

  it('separates a torr from a millimetre of mercury, which are not quite equal', () => {
    const torr = convert(1, 'pressure.atmosphere', 'pressure.torr') ?? 0;
    const mmhg = convert(1, 'pressure.atmosphere', 'pressure.mmhg') ?? 0;
    expect(torr).toBe(760);
    expect(mmhg).toBeCloseTo(759.9998917256112, 9);
    expect(mmhg).not.toBe(torr);
  });
});

describe('every pair inside a category', () => {
  it('round-trips through the base unit', () => {
    for (const unitsOfCategory of [
      unitsIn('length'),
      unitsIn('temperature'),
      unitsIn('fuel'),
      unitsIn('data'),
    ]) {
      for (const from of unitsOfCategory) {
        for (const to of unitsOfCategory) {
          const there = convert(21.5, from.id, to.id);
          expect(there).not.toBeNull();
          const back = convert(there ?? 0, to.id, from.id);
          expect(back).not.toBeNull();
          expect(back ?? 0).toBeCloseTo(21.5, 6);
        }
      }
    }
  });
});

describe('formatting a value', () => {
  it('prints nothing at all for what is not a number', () => {
    expect(formatValue(Number.NaN)).toBe('');
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatValue(Number.NEGATIVE_INFINITY)).toBe('');
  });

  it('prints zero as one digit', () => {
    expect(formatValue(0)).toBe('0');
    expect(formatValue(-0)).toBe('0');
  });

  it('rounds away the noise of binary floating point', () => {
    expect(formatValue(0.1 + 0.2)).toBe('0.3');
    expect(formatValue(1.005 * 100)).toBe('100.5');
  });

  it('trims trailing zeros rather than padding to the budget', () => {
    expect(formatValue(1.5)).toBe('1.5');
    expect(formatValue(2)).toBe('2');
    expect(formatValue(1.609344)).toBe('1.609344');
  });

  it('stops at twelve significant digits by default', () => {
    expect(formatValue(1 / 3)).toBe('0.333333333333');
    expect(formatValue(2 / 3)).toBe('0.666666666667');
    expect(DEFAULT_PRECISION).toBe(12);
  });

  it('honours a precision that is asked for, and clamps a silly one', () => {
    expect(formatValue(Math.PI, { precision: 3 })).toBe('3.14');
    expect(formatValue(Math.PI, { precision: 1 })).toBe('3');
    expect(formatValue(Math.PI, { precision: 0 })).toBe('3');
    // Two digits cannot reach the units place, so fixed point would have to
    // invent two zeros: the exponent form says only what is known.
    expect(formatValue(1234.5678, { precision: 2 })).toBe('1.2e3');
  });

  it('goes exponential once fixed point would be a wall of digits', () => {
    expect(formatValue(9460730472580800)).toBe('9.46073047258e15');
    expect(formatValue(1e21)).toBe('1e21');
    expect(formatValue(1.5e-9)).toBe('1.5e-9');
    expect(formatValue(-0.000000123456)).toBe('-1.23456e-7');
  });

  it('stays fixed point either side of those thresholds', () => {
    expect(formatValue(1e-6)).toBe('0.000001');
    expect(formatValue(123456789012)).toBe('123456789012');
  });

  it('keeps the sign', () => {
    expect(formatValue(-1.5)).toBe('-1.5');
    expect(formatValue(-273.15)).toBe('-273.15');
  });
});

describe('grouping digits', () => {
  it('groups long integers in threes', () => {
    expect(groupDigits('1609344')).toBe(`1${GROUP_SEPARATOR}609${GROUP_SEPARATOR}344`);
    expect(groupDigits('123456789')).toBe(`123${GROUP_SEPARATOR}456${GROUP_SEPARATOR}789`);
    expect(groupDigits('-1234567')).toBe(`-1${GROUP_SEPARATOR}234${GROUP_SEPARATOR}567`);
  });

  it('leaves short numbers, decimals and exponents alone', () => {
    expect(groupDigits('1000')).toBe('1000');
    expect(groupDigits('3.28083989501')).toBe('3.28083989501');
    expect(groupDigits('9.46073047258e15')).toBe('9.46073047258e15');
  });

  it('groups the integer part of a long decimal only', () => {
    expect(groupDigits('1234567.891')).toBe(`1${GROUP_SEPARATOR}234${GROUP_SEPARATOR}567.891`);
  });
});

describe('a value with its unit', () => {
  it('reads as the number then the symbol', () => {
    expect(formatQuantity(1, unit('length.metre'))).toBe('1 m');
    expect(formatQuantity(3.280839895013123, unit('length.foot'))).toBe('3.28083989501 ft');
    expect(formatQuantity(0, unit('temperature.celsius'))).toBe('0 °C');
  });

  it('groups a long integer', () => {
    expect(formatQuantity(1609344, unit('length.millimetre'))).toBe(
      `1${GROUP_SEPARATOR}609${GROUP_SEPARATOR}344 mm`,
    );
  });
});

describe('reading a value out of a field', () => {
  it('refuses an empty field', () => {
    expect(parseValue('')).toBeNull();
    expect(parseValue('   ')).toBeNull();
  });

  it('reads the ordinary shapes of a number', () => {
    expect(parseValue('1')).toBe(1);
    expect(parseValue('-2.5')).toBe(-2.5);
    expect(parseValue('+3')).toBe(3);
    expect(parseValue('.5')).toBe(0.5);
    expect(parseValue('2.')).toBe(2);
    expect(parseValue('1e3')).toBe(1000);
    expect(parseValue('1.5E-3')).toBe(0.0015);
  });

  it('tolerates spaces, underscores and a typographic minus', () => {
    expect(parseValue(' 1 609 344 ')).toBe(1609344);
    expect(parseValue(groupDigits('1609344'))).toBe(1609344);
    expect(parseValue('1_000')).toBe(1000);
    expect(parseValue('−40')).toBe(-40);
  });

  it('drops a comma only where it is grouping digits in threes', () => {
    expect(parseValue('1,234')).toBe(1234);
    expect(parseValue('1,234,567.5')).toBe(1234567.5);
  });

  it('refuses a comma that might be a decimal point rather than guessing', () => {
    expect(parseValue('1,5')).toBeNull();
    expect(parseValue('12,34')).toBeNull();
    expect(parseValue('1,23,456')).toBeNull();
  });

  it('refuses text that is not a number', () => {
    expect(parseValue('12 feet')).toBeNull();
    expect(parseValue('-')).toBeNull();
    expect(parseValue('1.2.3')).toBeNull();
    expect(parseValue('0x10')).toBeNull();
    expect(parseValue('Infinity')).toBeNull();
    expect(parseValue('NaN')).toBeNull();
  });

  it('round-trips what formatValue prints', () => {
    for (const value of [0, 1, -40, 0.1 + 0.2, 1 / 3, 1.5e-9, 9460730472580800]) {
      const text = formatValue(value);
      expect(parseValue(text)).toBeCloseTo(Number(value.toPrecision(12)), 12);
    }
  });
});

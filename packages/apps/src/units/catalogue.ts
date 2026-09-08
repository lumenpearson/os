/**
 * The catalogue. Every unit belongs to one category and is described against
 * that category's base unit in one of three ways:
 *
 *   factor      base = value × factor              (nearly everything)
 *   affine      base = value × scale + offset      (temperature: 0 °C is not
 *                                                   zero kelvin, so a factor
 *                                                   cannot express it)
 *   reciprocal  base = constant ÷ value            (fuel economy: miles per
 *                                                   gallon rises as litres
 *                                                   per 100 km falls)
 *
 * Factors are written as the exact definitions they come from — a US gallon is
 * 231 cubic inches, a pound-force is 4.4482216152605 N — rather than as
 * rounded decimals, so the arithmetic is as good as a double gets.
 *
 * Units that differ by country keep separate ids and names. There is no
 * "gallon" and no "pint" here: the US and the imperial ones are 20 % apart and
 * picking one silently is how a converter starts lying.
 */

export type CategoryId =
  | 'length'
  | 'mass'
  | 'area'
  | 'volume'
  | 'temperature'
  | 'time'
  | 'speed'
  | 'data'
  | 'angle'
  | 'pressure'
  | 'energy'
  | 'power'
  | 'frequency'
  | 'fuel';

export type UnitId = string;

/** How a unit relates to its category's base unit. */
export type UnitScale =
  | { kind: 'factor'; factor: number }
  | { kind: 'affine'; scale: number; offset: number }
  | { kind: 'reciprocal'; constant: number };

export interface Unit {
  id: UnitId;
  category: CategoryId;
  /** Written out, including the country when that matters. */
  name: string;
  /** The short form a value is printed with. */
  symbol: string;
  scale: UnitScale;
  /** Spellings and abbreviations the picker should also answer to. */
  aliases?: readonly string[];
  /** A qualifier the picker prints after the name. Never decoration. */
  note?: string;
}

export interface Category {
  id: CategoryId;
  name: string;
  /** The unit every other unit in the category is defined against. */
  base: UnitId;
}

const factor = (value: number): UnitScale => ({ kind: 'factor', factor: value });
const affine = (scale: number, offset: number): UnitScale => ({ kind: 'affine', scale, offset });
const reciprocal = (constant: number): UnitScale => ({ kind: 'reciprocal', constant });

// Definitions the tables below are built from, kept in one place so a factor
// reads as the identity it is rather than as a decimal to be trusted on faith.
// Where the standard fixes an exact decimal, that decimal is the literal: it
// parses to the nearest double, which a chain of multiplications need not.
const INCH = 0.0254; // metre, by international agreement (1959)
const FOOT = 0.3048; // 12 in
const YARD = 0.9144; // 3 ft
const MILE = 1609.344; // 5280 ft
const POUND = 0.45359237; // kilogram
const POUND_FORCE = 4.4482216152605; // newton
const SQUARE_INCH = 0.00064516; // square metre
const GALLON_US = 3.785411784; // litre: 231 in³
const GALLON_IMP = 4.54609; // litre
const FLUID_OUNCE_US = GALLON_US / 128;
const FLUID_OUNCE_IMP = 0.0284130625; // litre: a 160th of an imperial gallon
const BTU = 1055.05585262; // joule, international table
const CALORIE = 4.184; // joule, thermochemical
const FOOT_POUND = 1.3558179483314003; // joule: one pound-force through a foot
const ATMOSPHERE = 101325; // pascal

export const UNITS: readonly Unit[] = [
  // ── length: base metre ──────────────────────────────────────────────────
  {
    id: 'length.nanometre',
    category: 'length',
    name: 'Nanometre',
    symbol: 'nm',
    scale: factor(1e-9),
    aliases: ['nanometer'],
  },
  {
    id: 'length.micrometre',
    category: 'length',
    name: 'Micrometre',
    symbol: 'µm',
    scale: factor(1e-6),
    aliases: ['micrometer', 'micron'],
  },
  {
    id: 'length.millimetre',
    category: 'length',
    name: 'Millimetre',
    symbol: 'mm',
    scale: factor(1e-3),
    aliases: ['millimeter'],
  },
  {
    id: 'length.centimetre',
    category: 'length',
    name: 'Centimetre',
    symbol: 'cm',
    scale: factor(1e-2),
    aliases: ['centimeter'],
  },
  {
    id: 'length.metre',
    category: 'length',
    name: 'Metre',
    symbol: 'm',
    scale: factor(1),
    aliases: ['meter'],
  },
  {
    id: 'length.kilometre',
    category: 'length',
    name: 'Kilometre',
    symbol: 'km',
    scale: factor(1e3),
    aliases: ['kilometer', 'klick'],
  },
  {
    id: 'length.inch',
    category: 'length',
    name: 'Inch',
    symbol: 'in',
    scale: factor(INCH),
    aliases: ['inches'],
  },
  {
    id: 'length.foot',
    category: 'length',
    name: 'Foot',
    symbol: 'ft',
    scale: factor(FOOT),
    aliases: ['feet'],
  },
  { id: 'length.yard', category: 'length', name: 'Yard', symbol: 'yd', scale: factor(YARD) },
  {
    id: 'length.mile',
    category: 'length',
    name: 'Mile',
    symbol: 'mi',
    scale: factor(MILE),
    aliases: ['statute mile'],
  },
  {
    id: 'length.nautical-mile',
    category: 'length',
    name: 'Nautical mile',
    symbol: 'nmi',
    scale: factor(1852),
  },
  {
    id: 'length.furlong',
    category: 'length',
    name: 'Furlong',
    symbol: 'fur',
    scale: factor(MILE / 8),
  },
  {
    id: 'length.thou',
    category: 'length',
    name: 'Thou',
    symbol: 'thou',
    scale: factor(2.54e-5),
    aliases: ['mil'],
    note: 'one thousandth of an inch',
  },
  {
    id: 'length.angstrom',
    category: 'length',
    name: 'Ångström',
    symbol: 'Å',
    scale: factor(1e-10),
    aliases: ['angstrom'],
  },
  {
    id: 'length.astronomical-unit',
    category: 'length',
    name: 'Astronomical unit',
    symbol: 'au',
    scale: factor(149597870700),
  },
  {
    id: 'length.light-year',
    category: 'length',
    name: 'Light-year',
    symbol: 'ly',
    scale: factor(9460730472580800),
    aliases: ['lightyear'],
  },
  {
    id: 'length.parsec',
    category: 'length',
    name: 'Parsec',
    symbol: 'pc',
    scale: factor((149597870700 * 648000) / Math.PI),
  },

  // ── mass: base kilogram ─────────────────────────────────────────────────
  { id: 'mass.microgram', category: 'mass', name: 'Microgram', symbol: 'µg', scale: factor(1e-9) },
  { id: 'mass.milligram', category: 'mass', name: 'Milligram', symbol: 'mg', scale: factor(1e-6) },
  {
    id: 'mass.gram',
    category: 'mass',
    name: 'Gram',
    symbol: 'g',
    scale: factor(1e-3),
    aliases: ['gramme'],
  },
  {
    id: 'mass.kilogram',
    category: 'mass',
    name: 'Kilogram',
    symbol: 'kg',
    scale: factor(1),
    aliases: ['kilo'],
  },
  {
    id: 'mass.tonne',
    category: 'mass',
    name: 'Tonne',
    symbol: 't',
    scale: factor(1000),
    aliases: ['metric ton'],
    note: '1000 kg',
  },
  { id: 'mass.grain', category: 'mass', name: 'Grain', symbol: 'gr', scale: factor(6.479891e-5) },
  {
    id: 'mass.carat',
    category: 'mass',
    name: 'Carat',
    symbol: 'ct',
    scale: factor(2e-4),
    note: 'metric, 200 mg',
  },
  {
    id: 'mass.ounce',
    category: 'mass',
    name: 'Ounce',
    symbol: 'oz',
    scale: factor(POUND / 16),
    aliases: ['avoirdupois ounce'],
  },
  {
    id: 'mass.troy-ounce',
    category: 'mass',
    name: 'Troy ounce',
    symbol: 'ozt',
    scale: factor(0.0311034768),
    note: 'precious metals',
  },
  {
    id: 'mass.pound',
    category: 'mass',
    name: 'Pound',
    symbol: 'lb',
    scale: factor(POUND),
    aliases: ['pounds', 'lbs'],
  },
  { id: 'mass.stone', category: 'mass', name: 'Stone', symbol: 'st', scale: factor(14 * POUND) },
  {
    id: 'mass.short-ton',
    category: 'mass',
    name: 'US ton',
    symbol: 'ton',
    scale: factor(2000 * POUND),
    aliases: ['short ton'],
    note: '2000 lb',
  },
  {
    id: 'mass.long-ton',
    category: 'mass',
    name: 'Imperial ton',
    symbol: 'ton',
    scale: factor(1016.0469088),
    aliases: ['long ton'],
    note: '2240 lb',
  },

  // ── area: base square metre ─────────────────────────────────────────────
  {
    id: 'area.square-millimetre',
    category: 'area',
    name: 'Square millimetre',
    symbol: 'mm²',
    scale: factor(1e-6),
    aliases: ['square millimeter'],
  },
  {
    id: 'area.square-centimetre',
    category: 'area',
    name: 'Square centimetre',
    symbol: 'cm²',
    scale: factor(1e-4),
    aliases: ['square centimeter'],
  },
  {
    id: 'area.square-metre',
    category: 'area',
    name: 'Square metre',
    symbol: 'm²',
    scale: factor(1),
    aliases: ['square meter'],
  },
  {
    id: 'area.hectare',
    category: 'area',
    name: 'Hectare',
    symbol: 'ha',
    scale: factor(1e4),
    note: '10 000 m²',
  },
  {
    id: 'area.square-kilometre',
    category: 'area',
    name: 'Square kilometre',
    symbol: 'km²',
    scale: factor(1e6),
    aliases: ['square kilometer'],
  },
  {
    id: 'area.square-inch',
    category: 'area',
    name: 'Square inch',
    symbol: 'in²',
    scale: factor(SQUARE_INCH),
  },
  {
    id: 'area.square-foot',
    category: 'area',
    name: 'Square foot',
    symbol: 'ft²',
    scale: factor(0.09290304),
    aliases: ['square feet'],
  },
  {
    id: 'area.square-yard',
    category: 'area',
    name: 'Square yard',
    symbol: 'yd²',
    scale: factor(0.83612736),
  },
  {
    id: 'area.acre',
    category: 'area',
    name: 'Acre',
    symbol: 'ac',
    scale: factor(4046.8564224),
    note: '4840 yd²',
  },
  {
    id: 'area.square-mile',
    category: 'area',
    name: 'Square mile',
    symbol: 'mi²',
    scale: factor(2589988.110336),
  },

  // ── volume: base litre ──────────────────────────────────────────────────
  {
    id: 'volume.millilitre',
    category: 'volume',
    name: 'Millilitre',
    symbol: 'mL',
    scale: factor(1e-3),
    aliases: ['milliliter'],
  },
  {
    id: 'volume.centilitre',
    category: 'volume',
    name: 'Centilitre',
    symbol: 'cL',
    scale: factor(1e-2),
    aliases: ['centiliter'],
  },
  {
    id: 'volume.litre',
    category: 'volume',
    name: 'Litre',
    symbol: 'L',
    scale: factor(1),
    aliases: ['liter'],
  },
  {
    id: 'volume.cubic-centimetre',
    category: 'volume',
    name: 'Cubic centimetre',
    symbol: 'cm³',
    scale: factor(1e-3),
    aliases: ['cubic centimeter', 'cc'],
  },
  {
    id: 'volume.cubic-metre',
    category: 'volume',
    name: 'Cubic metre',
    symbol: 'm³',
    scale: factor(1000),
    aliases: ['cubic meter'],
  },
  {
    id: 'volume.cubic-inch',
    category: 'volume',
    name: 'Cubic inch',
    symbol: 'in³',
    scale: factor(0.016387064),
  },
  {
    id: 'volume.cubic-foot',
    category: 'volume',
    name: 'Cubic foot',
    symbol: 'ft³',
    scale: factor(28.316846592),
    aliases: ['cubic feet'],
  },
  {
    id: 'volume.teaspoon-us',
    category: 'volume',
    name: 'US teaspoon',
    symbol: 'tsp',
    scale: factor(FLUID_OUNCE_US / 6),
    note: '⅙ US fl oz',
  },
  {
    id: 'volume.tablespoon-us',
    category: 'volume',
    name: 'US tablespoon',
    symbol: 'tbsp',
    scale: factor(FLUID_OUNCE_US / 2),
    note: '½ US fl oz',
  },
  {
    id: 'volume.fluid-ounce-us',
    category: 'volume',
    name: 'US fluid ounce',
    symbol: 'fl oz',
    scale: factor(FLUID_OUNCE_US),
    note: '1/128 US gallon',
  },
  {
    id: 'volume.cup-us',
    category: 'volume',
    name: 'US cup',
    symbol: 'cup',
    scale: factor(8 * FLUID_OUNCE_US),
    note: '8 US fl oz',
  },
  {
    id: 'volume.pint-us',
    category: 'volume',
    name: 'US pint',
    symbol: 'pt',
    scale: factor(16 * FLUID_OUNCE_US),
    note: '16 US fl oz',
  },
  {
    id: 'volume.quart-us',
    category: 'volume',
    name: 'US quart',
    symbol: 'qt',
    scale: factor(32 * FLUID_OUNCE_US),
    note: '¼ US gallon',
  },
  {
    id: 'volume.gallon-us',
    category: 'volume',
    name: 'US gallon',
    symbol: 'gal',
    scale: factor(GALLON_US),
    note: '231 in³',
  },
  {
    id: 'volume.fluid-ounce-imp',
    category: 'volume',
    name: 'Imperial fluid ounce',
    symbol: 'fl oz',
    scale: factor(FLUID_OUNCE_IMP),
    note: '1/160 imperial gallon',
  },
  {
    id: 'volume.pint-imp',
    category: 'volume',
    name: 'Imperial pint',
    symbol: 'pt',
    scale: factor(GALLON_IMP / 8),
    note: '20 imperial fl oz',
  },
  {
    id: 'volume.quart-imp',
    category: 'volume',
    name: 'Imperial quart',
    symbol: 'qt',
    scale: factor(GALLON_IMP / 4),
    note: '¼ imperial gallon',
  },
  {
    id: 'volume.gallon-imp',
    category: 'volume',
    name: 'Imperial gallon',
    symbol: 'gal',
    scale: factor(GALLON_IMP),
    note: '4.54609 L',
  },

  // ── temperature: base kelvin, affine throughout ─────────────────────────
  {
    id: 'temperature.kelvin',
    category: 'temperature',
    name: 'Kelvin',
    symbol: 'K',
    scale: affine(1, 0),
  },
  {
    id: 'temperature.celsius',
    category: 'temperature',
    name: 'Celsius',
    symbol: '°C',
    scale: affine(1, 273.15),
    aliases: ['centigrade'],
  },
  {
    id: 'temperature.fahrenheit',
    category: 'temperature',
    name: 'Fahrenheit',
    symbol: '°F',
    scale: affine(5 / 9, 273.15 - 32 * (5 / 9)),
  },
  {
    id: 'temperature.rankine',
    category: 'temperature',
    name: 'Rankine',
    symbol: '°R',
    scale: affine(5 / 9, 0),
    note: 'Fahrenheit degrees from absolute zero',
  },

  // ── time: base second ───────────────────────────────────────────────────
  {
    id: 'time.nanosecond',
    category: 'time',
    name: 'Nanosecond',
    symbol: 'ns',
    scale: factor(1e-9),
  },
  {
    id: 'time.microsecond',
    category: 'time',
    name: 'Microsecond',
    symbol: 'µs',
    scale: factor(1e-6),
  },
  {
    id: 'time.millisecond',
    category: 'time',
    name: 'Millisecond',
    symbol: 'ms',
    scale: factor(1e-3),
  },
  {
    id: 'time.second',
    category: 'time',
    name: 'Second',
    symbol: 's',
    scale: factor(1),
    aliases: ['sec'],
  },
  { id: 'time.minute', category: 'time', name: 'Minute', symbol: 'min', scale: factor(60) },
  {
    id: 'time.hour',
    category: 'time',
    name: 'Hour',
    symbol: 'h',
    scale: factor(3600),
    aliases: ['hr'],
  },
  { id: 'time.day', category: 'time', name: 'Day', symbol: 'd', scale: factor(86400) },
  { id: 'time.week', category: 'time', name: 'Week', symbol: 'wk', scale: factor(604800) },
  {
    id: 'time.month',
    category: 'time',
    name: 'Month',
    symbol: 'mo',
    scale: factor(31556952 / 12),
    note: 'a twelfth of a Gregorian year',
  },
  {
    id: 'time.year',
    category: 'time',
    name: 'Year',
    symbol: 'yr',
    scale: factor(31556952),
    note: 'Gregorian, 365.2425 days',
  },

  // ── speed: base metre per second ────────────────────────────────────────
  {
    id: 'speed.metre-per-second',
    category: 'speed',
    name: 'Metres per second',
    symbol: 'm/s',
    scale: factor(1),
    aliases: ['meters per second', 'mps'],
  },
  {
    id: 'speed.kilometre-per-hour',
    category: 'speed',
    name: 'Kilometres per hour',
    symbol: 'km/h',
    scale: factor(1000 / 3600),
    aliases: ['kilometers per hour', 'kph'],
  },
  {
    id: 'speed.mile-per-hour',
    category: 'speed',
    name: 'Miles per hour',
    symbol: 'mph',
    scale: factor(0.44704),
  },
  {
    id: 'speed.foot-per-second',
    category: 'speed',
    name: 'Feet per second',
    symbol: 'ft/s',
    scale: factor(FOOT),
    aliases: ['fps'],
  },
  {
    id: 'speed.knot',
    category: 'speed',
    name: 'Knot',
    symbol: 'kn',
    scale: factor(1852 / 3600),
    note: 'one nautical mile per hour',
  },
  {
    id: 'speed.mach',
    category: 'speed',
    name: 'Mach',
    symbol: 'Ma',
    scale: factor(340.29),
    note: 'dry air at sea level, 15 °C',
  },
  {
    id: 'speed.light',
    category: 'speed',
    name: 'Speed of light',
    symbol: 'c',
    scale: factor(299792458),
    note: 'in vacuum',
  },

  // ── data: base byte. The decimal and binary families stay apart. ────────
  { id: 'data.bit', category: 'data', name: 'Bit', symbol: 'bit', scale: factor(1 / 8) },
  {
    id: 'data.kilobit',
    category: 'data',
    name: 'Kilobit',
    symbol: 'kbit',
    scale: factor(1000 / 8),
    note: '1000 bits',
  },
  {
    id: 'data.megabit',
    category: 'data',
    name: 'Megabit',
    symbol: 'Mbit',
    scale: factor(1e6 / 8),
    note: '10⁶ bits',
  },
  {
    id: 'data.gigabit',
    category: 'data',
    name: 'Gigabit',
    symbol: 'Gbit',
    scale: factor(1e9 / 8),
    note: '10⁹ bits',
  },
  { id: 'data.byte', category: 'data', name: 'Byte', symbol: 'B', scale: factor(1) },
  {
    id: 'data.kilobyte',
    category: 'data',
    name: 'Kilobyte',
    symbol: 'kB',
    scale: factor(1e3),
    note: '1000 bytes',
  },
  {
    id: 'data.megabyte',
    category: 'data',
    name: 'Megabyte',
    symbol: 'MB',
    scale: factor(1e6),
    note: '10⁶ bytes',
  },
  {
    id: 'data.gigabyte',
    category: 'data',
    name: 'Gigabyte',
    symbol: 'GB',
    scale: factor(1e9),
    note: '10⁹ bytes',
  },
  {
    id: 'data.terabyte',
    category: 'data',
    name: 'Terabyte',
    symbol: 'TB',
    scale: factor(1e12),
    note: '10¹² bytes',
  },
  {
    id: 'data.petabyte',
    category: 'data',
    name: 'Petabyte',
    symbol: 'PB',
    scale: factor(1e15),
    note: '10¹⁵ bytes',
  },
  {
    id: 'data.kibibyte',
    category: 'data',
    name: 'Kibibyte',
    symbol: 'KiB',
    scale: factor(1024),
    note: '1024 bytes',
  },
  {
    id: 'data.mebibyte',
    category: 'data',
    name: 'Mebibyte',
    symbol: 'MiB',
    scale: factor(1024 ** 2),
    note: '2²⁰ bytes',
  },
  {
    id: 'data.gibibyte',
    category: 'data',
    name: 'Gibibyte',
    symbol: 'GiB',
    scale: factor(1024 ** 3),
    note: '2³⁰ bytes',
  },
  {
    id: 'data.tebibyte',
    category: 'data',
    name: 'Tebibyte',
    symbol: 'TiB',
    scale: factor(1024 ** 4),
    note: '2⁴⁰ bytes',
  },
  {
    id: 'data.pebibyte',
    category: 'data',
    name: 'Pebibyte',
    symbol: 'PiB',
    scale: factor(1024 ** 5),
    note: '2⁵⁰ bytes',
  },

  // ── angle: base radian ──────────────────────────────────────────────────
  { id: 'angle.radian', category: 'angle', name: 'Radian', symbol: 'rad', scale: factor(1) },
  {
    id: 'angle.milliradian',
    category: 'angle',
    name: 'Milliradian',
    symbol: 'mrad',
    scale: factor(1e-3),
  },
  {
    id: 'angle.degree',
    category: 'angle',
    name: 'Degree',
    symbol: '°',
    scale: factor(Math.PI / 180),
    aliases: ['deg'],
  },
  {
    id: 'angle.gradian',
    category: 'angle',
    name: 'Gradian',
    symbol: 'gon',
    scale: factor(Math.PI / 200),
    aliases: ['gon', 'grad'],
    note: '400 to a turn',
  },
  {
    id: 'angle.arcminute',
    category: 'angle',
    name: 'Arcminute',
    symbol: '′',
    scale: factor(Math.PI / 10800),
    aliases: ['arcmin', 'minute of arc'],
  },
  {
    id: 'angle.arcsecond',
    category: 'angle',
    name: 'Arcsecond',
    symbol: '″',
    scale: factor(Math.PI / 648000),
    aliases: ['arcsec', 'second of arc'],
  },
  {
    id: 'angle.turn',
    category: 'angle',
    name: 'Turn',
    symbol: 'turn',
    scale: factor(2 * Math.PI),
    aliases: ['revolution', 'cycle'],
  },

  // ── pressure: base pascal ───────────────────────────────────────────────
  { id: 'pressure.pascal', category: 'pressure', name: 'Pascal', symbol: 'Pa', scale: factor(1) },
  {
    id: 'pressure.hectopascal',
    category: 'pressure',
    name: 'Hectopascal',
    symbol: 'hPa',
    scale: factor(100),
  },
  {
    id: 'pressure.kilopascal',
    category: 'pressure',
    name: 'Kilopascal',
    symbol: 'kPa',
    scale: factor(1000),
  },
  {
    id: 'pressure.megapascal',
    category: 'pressure',
    name: 'Megapascal',
    symbol: 'MPa',
    scale: factor(1e6),
  },
  {
    id: 'pressure.millibar',
    category: 'pressure',
    name: 'Millibar',
    symbol: 'mbar',
    scale: factor(100),
  },
  { id: 'pressure.bar', category: 'pressure', name: 'Bar', symbol: 'bar', scale: factor(1e5) },
  {
    id: 'pressure.atmosphere',
    category: 'pressure',
    name: 'Standard atmosphere',
    symbol: 'atm',
    scale: factor(ATMOSPHERE),
    note: '101 325 Pa',
  },
  {
    id: 'pressure.torr',
    category: 'pressure',
    name: 'Torr',
    symbol: 'Torr',
    scale: factor(ATMOSPHERE / 760),
    note: '1/760 atm',
  },
  {
    id: 'pressure.mmhg',
    category: 'pressure',
    name: 'Millimetre of mercury',
    symbol: 'mmHg',
    scale: factor(133.322387415),
    note: 'conventional; a shade over a torr',
  },
  {
    id: 'pressure.inhg',
    category: 'pressure',
    name: 'Inch of mercury',
    symbol: 'inHg',
    scale: factor(3386.389),
    note: 'conventional',
  },
  {
    id: 'pressure.psi',
    category: 'pressure',
    name: 'Pound per square inch',
    symbol: 'psi',
    scale: factor(POUND_FORCE / SQUARE_INCH),
  },

  // ── energy: base joule ──────────────────────────────────────────────────
  { id: 'energy.joule', category: 'energy', name: 'Joule', symbol: 'J', scale: factor(1) },
  {
    id: 'energy.kilojoule',
    category: 'energy',
    name: 'Kilojoule',
    symbol: 'kJ',
    scale: factor(1000),
  },
  {
    id: 'energy.calorie',
    category: 'energy',
    name: 'Calorie',
    symbol: 'cal',
    scale: factor(CALORIE),
    note: 'thermochemical',
  },
  {
    id: 'energy.kilocalorie',
    category: 'energy',
    name: 'Kilocalorie',
    symbol: 'kcal',
    scale: factor(1000 * CALORIE),
    aliases: ['food calorie', 'Cal'],
  },
  {
    id: 'energy.watt-hour',
    category: 'energy',
    name: 'Watt-hour',
    symbol: 'Wh',
    scale: factor(3600),
  },
  {
    id: 'energy.kilowatt-hour',
    category: 'energy',
    name: 'Kilowatt-hour',
    symbol: 'kWh',
    scale: factor(3.6e6),
  },
  {
    id: 'energy.electronvolt',
    category: 'energy',
    name: 'Electronvolt',
    symbol: 'eV',
    scale: factor(1.602176634e-19),
  },
  {
    id: 'energy.btu',
    category: 'energy',
    name: 'British thermal unit',
    symbol: 'BTU',
    scale: factor(BTU),
    note: 'international table',
  },
  {
    id: 'energy.therm',
    category: 'energy',
    name: 'US therm',
    symbol: 'thm',
    scale: factor(105480400),
    note: '105.4804 MJ',
  },
  {
    id: 'energy.foot-pound',
    category: 'energy',
    name: 'Foot-pound',
    symbol: 'ft·lb',
    scale: factor(FOOT_POUND),
    aliases: ['foot pound force'],
  },

  // ── power: base watt ────────────────────────────────────────────────────
  {
    id: 'power.milliwatt',
    category: 'power',
    name: 'Milliwatt',
    symbol: 'mW',
    scale: factor(1e-3),
  },
  { id: 'power.watt', category: 'power', name: 'Watt', symbol: 'W', scale: factor(1) },
  { id: 'power.kilowatt', category: 'power', name: 'Kilowatt', symbol: 'kW', scale: factor(1000) },
  { id: 'power.megawatt', category: 'power', name: 'Megawatt', symbol: 'MW', scale: factor(1e6) },
  { id: 'power.gigawatt', category: 'power', name: 'Gigawatt', symbol: 'GW', scale: factor(1e9) },
  {
    id: 'power.horsepower',
    category: 'power',
    name: 'Mechanical horsepower',
    symbol: 'hp',
    scale: factor(550 * FOOT_POUND),
    note: '550 ft·lb per second',
  },
  {
    id: 'power.metric-horsepower',
    category: 'power',
    name: 'Metric horsepower',
    symbol: 'PS',
    scale: factor(735.49875),
    note: '75 kgf·m per second',
  },
  {
    id: 'power.btu-per-hour',
    category: 'power',
    name: 'BTU per hour',
    symbol: 'BTU/h',
    scale: factor(BTU / 3600),
  },
  {
    id: 'power.foot-pound-per-second',
    category: 'power',
    name: 'Foot-pounds per second',
    symbol: 'ft·lb/s',
    scale: factor(FOOT_POUND),
  },

  // ── frequency: base hertz ───────────────────────────────────────────────
  {
    id: 'frequency.hertz',
    category: 'frequency',
    name: 'Hertz',
    symbol: 'Hz',
    scale: factor(1),
    aliases: ['cycles per second'],
  },
  {
    id: 'frequency.kilohertz',
    category: 'frequency',
    name: 'Kilohertz',
    symbol: 'kHz',
    scale: factor(1e3),
  },
  {
    id: 'frequency.megahertz',
    category: 'frequency',
    name: 'Megahertz',
    symbol: 'MHz',
    scale: factor(1e6),
  },
  {
    id: 'frequency.gigahertz',
    category: 'frequency',
    name: 'Gigahertz',
    symbol: 'GHz',
    scale: factor(1e9),
  },
  {
    id: 'frequency.terahertz',
    category: 'frequency',
    name: 'Terahertz',
    symbol: 'THz',
    scale: factor(1e12),
  },
  {
    id: 'frequency.rpm',
    category: 'frequency',
    name: 'Revolutions per minute',
    symbol: 'rpm',
    scale: factor(1 / 60),
  },
  {
    id: 'frequency.radian-per-second',
    category: 'frequency',
    name: 'Radians per second',
    symbol: 'rad/s',
    scale: factor(1 / (2 * Math.PI)),
    note: 'angular: 1 Hz is 2π rad/s',
  },

  // ── fuel economy: base litres per 100 km ────────────────────────────────
  // Consumption (litres per distance) and economy (distance per volume) are
  // reciprocals of each other, so this category mixes both scale kinds.
  {
    id: 'fuel.litre-per-100km',
    category: 'fuel',
    name: 'Litres per 100 km',
    symbol: 'L/100 km',
    scale: factor(1),
    aliases: ['liters per 100 km'],
  },
  {
    id: 'fuel.km-per-litre',
    category: 'fuel',
    name: 'Kilometres per litre',
    symbol: 'km/L',
    scale: reciprocal(100),
    aliases: ['kilometers per liter', 'kmpl'],
  },
  {
    id: 'fuel.mpg-us',
    category: 'fuel',
    name: 'Miles per US gallon',
    symbol: 'mpg',
    scale: reciprocal((GALLON_US * 100) / (MILE / 1000)),
    note: 'the US window sticker figure',
  },
  {
    id: 'fuel.mpg-imp',
    category: 'fuel',
    name: 'Miles per imperial gallon',
    symbol: 'mpg',
    scale: reciprocal((GALLON_IMP * 100) / (MILE / 1000)),
    note: 'UK and Ireland; 20 % larger gallon',
  },
  {
    id: 'fuel.gallon-us-per-100mi',
    category: 'fuel',
    name: 'US gallons per 100 miles',
    symbol: 'gal/100 mi',
    scale: factor(GALLON_US / (MILE / 1000)),
    note: 'the US consumption figure',
  },
];

export const CATEGORIES: readonly Category[] = [
  { id: 'length', name: 'Length', base: 'length.metre' },
  { id: 'mass', name: 'Mass', base: 'mass.kilogram' },
  { id: 'area', name: 'Area', base: 'area.square-metre' },
  { id: 'volume', name: 'Volume', base: 'volume.litre' },
  { id: 'temperature', name: 'Temperature', base: 'temperature.kelvin' },
  { id: 'time', name: 'Time', base: 'time.second' },
  { id: 'speed', name: 'Speed', base: 'speed.metre-per-second' },
  { id: 'data', name: 'Data', base: 'data.byte' },
  { id: 'angle', name: 'Angle', base: 'angle.radian' },
  { id: 'pressure', name: 'Pressure', base: 'pressure.pascal' },
  { id: 'energy', name: 'Energy', base: 'energy.joule' },
  { id: 'power', name: 'Power', base: 'power.watt' },
  { id: 'frequency', name: 'Frequency', base: 'frequency.hertz' },
  { id: 'fuel', name: 'Fuel economy', base: 'fuel.litre-per-100km' },
];

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

/** The pair a category opens on. */
export const DEFAULT_PAIR: Record<CategoryId, readonly [UnitId, UnitId]> = {
  length: ['length.metre', 'length.foot'],
  mass: ['mass.kilogram', 'mass.pound'],
  area: ['area.square-metre', 'area.square-foot'],
  volume: ['volume.litre', 'volume.gallon-us'],
  temperature: ['temperature.celsius', 'temperature.fahrenheit'],
  time: ['time.hour', 'time.minute'],
  speed: ['speed.kilometre-per-hour', 'speed.mile-per-hour'],
  data: ['data.megabyte', 'data.mebibyte'],
  angle: ['angle.degree', 'angle.radian'],
  pressure: ['pressure.bar', 'pressure.psi'],
  energy: ['energy.kilojoule', 'energy.kilocalorie'],
  power: ['power.kilowatt', 'power.horsepower'],
  frequency: ['frequency.hertz', 'frequency.rpm'],
  fuel: ['fuel.mpg-us', 'fuel.litre-per-100km'],
};

const BY_ID = new Map<UnitId, Unit>(UNITS.map((unit) => [unit.id, unit]));

const BY_CATEGORY = new Map<CategoryId, readonly Unit[]>(
  CATEGORY_IDS.map((id) => [id, UNITS.filter((unit) => unit.category === id)]),
);

const CATEGORY_BY_ID = new Map<CategoryId, Category>(CATEGORIES.map((c) => [c.id, c]));

export function unitById(id: UnitId): Unit | undefined {
  return BY_ID.get(id);
}

/** The units of one category, in catalogue order (small to large). */
export function unitsIn(category: CategoryId): readonly Unit[] {
  return BY_CATEGORY.get(category) ?? [];
}

export function categoryById(id: CategoryId): Category | undefined {
  return CATEGORY_BY_ID.get(id);
}

/**
 * The unit every other unit in the category is defined against. The catalogue
 * gives each category exactly one, which `units.test.ts` holds it to.
 */
export function baseUnit(category: CategoryId): Unit {
  const id = CATEGORY_BY_ID.get(category)?.base;
  const unit = id === undefined ? undefined : BY_ID.get(id);
  if (!unit) throw new Error(`units: category "${category}" has no base unit`);
  return unit;
}

/**
 * `id` when it names a unit of `category`, else that category's base unit —
 * so a stale id in the settings file lands on something real.
 */
export function unitIn(category: CategoryId, id: UnitId): Unit {
  const unit = BY_ID.get(id);
  return unit && unit.category === category ? unit : baseUnit(category);
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && CATEGORY_BY_ID.has(value as CategoryId);
}

/** Whether two units can be converted between at all. */
export function sameCategory(a: UnitId, b: UnitId): boolean {
  const left = BY_ID.get(a);
  const right = BY_ID.get(b);
  return left !== undefined && right !== undefined && left.category === right.category;
}

/** The category a unit belongs to, or null for an id nothing matches. */
export function categoryOf(id: UnitId): CategoryId | null {
  return BY_ID.get(id)?.category ?? null;
}

/** The category one step along from `id`; wraps at both ends. */
export function stepCategory(id: CategoryId, direction: 1 | -1): CategoryId {
  const index = CATEGORY_IDS.indexOf(id);
  if (index === -1) return id;
  const next = (index + direction + CATEGORY_IDS.length) % CATEGORY_IDS.length;
  return CATEGORY_IDS[next] ?? id;
}

/**
 * Display formatting. Pure: the locale comes in as an argument so the
 * component can pass the region setting and tests can pin "en-US".
 */
import {
  CellError,
  numberToText,
  parseDateText,
  parseNumberText,
  type Scalar,
  serialToDate,
} from './values';

export type NumberFormat = 'general' | 'number' | 'percent' | 'currency' | 'date';
export type Align = 'left' | 'center' | 'right';

export const NUMBER_FORMATS: ReadonlyArray<{ value: NumberFormat; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
];

export interface FormatOptions {
  locale?: string;
  currency?: string;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numberFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, options);
    } catch {
      f = new Intl.NumberFormat('en-US', options);
    }
    numberFormatters.set(key, f);
  }
  return f;
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dateFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, options);
    } catch {
      f = new Intl.DateTimeFormat('en-US', options);
    }
    dateFormatters.set(key, f);
  }
  return f;
}

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  JP: 'JPY',
  CN: 'CNY',
  IN: 'INR',
  RU: 'RUB',
  BR: 'BRL',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  KR: 'KRW',
  MX: 'MXN',
  UA: 'UAH',
  TR: 'TRY',
  CZ: 'CZK',
  HU: 'HUF',
  ZA: 'ZAR',
  SG: 'SGD',
  HK: 'HKD',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  FI: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
  GR: 'EUR',
  SK: 'EUR',
  SI: 'EUR',
  EE: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
};
const LANGUAGE_CURRENCY: Record<string, string> = {
  en: 'USD',
  de: 'EUR',
  fr: 'EUR',
  it: 'EUR',
  es: 'EUR',
  nl: 'EUR',
  pt: 'EUR',
  fi: 'EUR',
  ja: 'JPY',
  zh: 'CNY',
  ru: 'RUB',
  uk: 'UAH',
  pl: 'PLN',
  sv: 'SEK',
  nb: 'NOK',
  da: 'DKK',
  ko: 'KRW',
  tr: 'TRY',
  cs: 'CZK',
  hu: 'HUF',
  hi: 'INR',
};

/** The currency a locale most likely means; USD when unsure. */
export function currencyForLocale(locale: string): string {
  const [lang, region] = locale.split(/[-_]/);
  if (region && REGION_CURRENCY[region.toUpperCase()])
    return REGION_CURRENCY[region.toUpperCase()] ?? 'USD';
  return LANGUAGE_CURRENCY[(lang ?? '').toLowerCase()] ?? 'USD';
}

/** The "General" format: as many decimals as needed, no grouping, exponent for extremes. */
export function formatGeneral(n: number, locale = 'en-US'): string {
  if (!Number.isFinite(n)) return numberToText(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return numberFormatter(locale, { notation: 'scientific', maximumFractionDigits: 5 }).format(n);
  }
  return numberFormatter(locale, { maximumFractionDigits: 10, useGrouping: false }).format(n);
}

export function formatDate(
  serial: number,
  locale = 'en-US',
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (!Number.isFinite(serial)) return numberToText(serial);
  return dateFormatter(locale, { dateStyle: style }).format(serialToDate(serial));
}

/** Text shown in a cell for a computed value under a style's number format. */
export function formatValue(
  value: Scalar,
  format: NumberFormat = 'general',
  options: FormatOptions = {},
): string {
  const locale = options.locale ?? 'en-US';
  if (value === null) return '';
  if (value instanceof CellError) return value.code;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') {
    if (format === 'date') {
      const serial = parseDateText(value);
      if (serial !== null) return formatDate(serial, locale);
    } else if (format !== 'general') {
      const n = parseNumberText(value);
      if (n !== null) return formatValue(n, format, options);
    }
    return value;
  }
  switch (format) {
    case 'number':
      return numberFormatter(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }).format(value);
    case 'percent':
      return numberFormatter(locale, {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case 'currency':
      return numberFormatter(locale, {
        style: 'currency',
        currency: options.currency ?? currencyForLocale(locale),
      }).format(value);
    case 'date':
      return formatDate(value, locale);
    default:
      return formatGeneral(value, locale);
  }
}

/** Numbers sit right, text left, booleans and errors in the middle. */
export function defaultAlign(value: Scalar): Align {
  if (typeof value === 'number') return 'right';
  if (typeof value === 'boolean' || value instanceof CellError) return 'center';
  return 'left';
}

const DATE_TOKEN_RE = /yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm/gi;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function formatDatePattern(serial: number, pattern: string, locale: string): string {
  const date = serialToDate(serial);
  const monthNames = (style: 'short' | 'long') =>
    dateFormatter(locale, { month: style }).format(date);
  const dayNames = (style: 'short' | 'long') =>
    dateFormatter(locale, { weekday: style }).format(date);
  const twelveHour = /am\/pm/i.test(pattern);
  const tokens = [...pattern.matchAll(DATE_TOKEN_RE)];
  let out = '';
  let cursor = 0;
  tokens.forEach((match, index) => {
    const token = match[0];
    const at = match.index ?? 0;
    out += pattern.slice(cursor, at);
    cursor = at + token.length;
    const lower = token.toLowerCase();
    const prev = tokens[index - 1]?.[0].toLowerCase() ?? '';
    const next = tokens[index + 1]?.[0].toLowerCase() ?? '';
    const minutes =
      (lower === 'mm' || lower === 'm') &&
      (prev === 'h' || prev === 'hh' || next === 's' || next === 'ss');
    switch (lower) {
      case 'yyyy':
        out += String(date.getFullYear());
        break;
      case 'yy':
        out += pad(date.getFullYear() % 100, 2);
        break;
      case 'mmmm':
        out += monthNames('long');
        break;
      case 'mmm':
        out += monthNames('short');
        break;
      case 'mm':
        out += minutes ? pad(date.getMinutes(), 2) : pad(date.getMonth() + 1, 2);
        break;
      case 'm':
        out += minutes ? String(date.getMinutes()) : String(date.getMonth() + 1);
        break;
      case 'dddd':
        out += dayNames('long');
        break;
      case 'ddd':
        out += dayNames('short');
        break;
      case 'dd':
        out += pad(date.getDate(), 2);
        break;
      case 'd':
        out += String(date.getDate());
        break;
      case 'hh':
      case 'h': {
        const hours = twelveHour ? date.getHours() % 12 || 12 : date.getHours();
        out += lower === 'hh' ? pad(hours, 2) : String(hours);
        break;
      }
      case 'ss':
        out += pad(date.getSeconds(), 2);
        break;
      case 's':
        out += String(date.getSeconds());
        break;
      case 'am/pm':
        out += date.getHours() < 12 ? 'AM' : 'PM';
        break;
    }
  });
  return out + pattern.slice(cursor);
}

/**
 * TEXT()-style patterns: "0", "0.00", "#,##0.00", "0%", "$#,##0", "yyyy-mm-dd",
 * "d mmm yyyy", "hh:mm". Text that is not a pattern is returned as is.
 */
export function formatPattern(value: Scalar, pattern: string, locale = 'en-US'): string {
  if (value === null) return '';
  if (value instanceof CellError) return value.code;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const isDatePattern = /[ymdhs]/i.test(pattern) && !/[#0]/.test(pattern);
  if (isDatePattern) {
    const serial = typeof value === 'number' ? value : parseDateText(value);
    if (serial === null) return typeof value === 'string' ? value : numberToText(value);
    return formatDatePattern(serial, pattern, locale);
  }
  const n = typeof value === 'number' ? value : parseNumberText(value);
  if (n === null) return String(value);
  const core = /[#0][#0,.]*%?/.exec(pattern);
  if (!core) return numberToText(n);
  const spec = core[0];
  const prefix = pattern.slice(0, core.index);
  const suffix = pattern.slice(core.index + spec.length);
  const percent = spec.endsWith('%');
  const decimals = (spec.replace('%', '').split('.')[1] ?? '').length;
  const grouping = spec.includes(',');
  const text = numberFormatter(locale, {
    style: percent ? 'percent' : 'decimal',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
  }).format(n);
  return `${prefix}${text}${suffix}`;
}

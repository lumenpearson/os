/**
 * vCard 3.0 (RFC 2426) and 4.0 (RFC 6350): reading and writing.
 *
 * The awkward parts of the format, all of which real exports contain:
 *
 * - **Folding.** A line longer than 75 octets is continued on the next line,
 *   which starts with one space or tab. Unfolding removes that one character
 *   and nothing else, so a space inside a value survives a fold through it.
 * - **Escaping.** Inside a value, `\,` `\;` `\\` and `\n` stand for a comma,
 *   a semicolon, a backslash and a newline. Structured values (N, ADR, ORG)
 *   split on unescaped semicolons; list values (CATEGORIES, NICKNAME) split on
 *   unescaped commas.
 * - **Parameters.** `TEL;TYPE=WORK,VOICE:` (3.0), `TEL;TYPE="work,voice":`
 *   (4.0) and the vCard 2.1 shorthand `TEL;WORK;VOICE:` all mean the same
 *   thing. A quoted parameter value may contain `,` `;` and `:`.
 * - **Grouped labels.** Apple writes `item1.TEL:…` with `item1.X-ABLabel:` next
 *   to it for a custom label; that label wins over TYPE.
 *
 * What the model cannot hold is dropped rather than mangled: N's honorific
 * prefix and suffix, and embedded PHOTO data (a photo here is a path in the
 * VFS, so an inline image has nowhere to live).
 *
 * Fields with no vCard property of their own — the record id, the two
 * timestamps, the star — are written as UID, REV and `X-LUMEN-*`, which is
 * what makes `parse(serialise(contact))` give back an equal contact.
 */

import {
  type Contact,
  emptyContact,
  type LabelledValue,
  normalizeBirthday,
  normalizeGroups,
  normalizeLabel,
  type PostalAddress,
} from './contact';
import { displayName } from './sort';

export type VcardVersion = '3.0' | '4.0';

export const VCARD_VERSIONS: readonly VcardVersion[] = ['3.0', '4.0'];

export interface VcardParam {
  /** Upper case. */
  name: string;
  values: string[];
}

export interface VcardProperty {
  /** The `item1` of `item1.TEL`, or the empty string. */
  group: string;
  /** Upper case. */
  name: string;
  params: VcardParam[];
  /** Still escaped; use `unescapeText` or one of the splitters. */
  value: string;
}

export interface ParseOptions {
  /** Timestamps for cards that carry none. */
  now?: number;
  /** Ids for cards with no UID, by position in the file. */
  makeId?: (index: number) => string;
}

export interface SerialiseOptions {
  version?: VcardVersion;
}

/** Longest line before folding, in octets, per RFC 6350. */
const FOLD_AT = 75;

// ── lines ─────────────────────────────────────────────────────────────────

/** Split on any line ending and re-join folded continuation lines. */
export function unfold(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const out: string[] = [];
  for (const line of lines) {
    const continues = line.startsWith(' ') || line.startsWith('\t');
    const previous = out.length - 1;
    const head = out[previous];
    if (continues && head !== undefined) out[previous] = head + line.slice(1);
    else out.push(line);
  }
  return out;
}

function utf8Length(character: string): number {
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/** Fold at 75 octets, never inside a character. */
export function foldLine(line: string, max = FOLD_AT): string {
  let out = '';
  let octets = 0;
  for (const character of line) {
    const size = utf8Length(character);
    if (octets > 0 && octets + size > max) {
      out += '\r\n ';
      octets = 1;
    }
    out += character;
    octets += size;
  }
  return out;
}

/** Split on a separator that is not inside double quotes. */
function splitUnquoted(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text.charAt(i);
    if (character === '"') quoted = !quoted;
    else if (character === separator && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

/** Split on a separator that is not escaped with a backslash. */
function splitEscaped(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const character = value.charAt(i);
    if (character === '\\') {
      current += character + value.charAt(i + 1);
      i += 1;
      continue;
    }
    if (character === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

export function unescapeText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const character = value.charAt(i);
    if (character !== '\\') {
      out += character;
      continue;
    }
    const next = value.charAt(i + 1);
    i += 1;
    if (next === 'n' || next === 'N') out += '\n';
    else if (next === '') out += '\\';
    else out += next;
  }
  return out;
}

export function escapeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Components of a structured value (N, ADR, ORG), unescaped. */
export function splitStructured(value: string): string[] {
  return splitEscaped(value, ';').map(unescapeText);
}

/** Members of a list value (CATEGORIES, NICKNAME), unescaped. */
export function splitList(value: string): string[] {
  return splitEscaped(value, ',').map(unescapeText);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** One unfolded line as name, parameters and raw value. */
export function parseProperty(line: string): VcardProperty | null {
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line.charAt(i);
    if (character === '"') quoted = !quoted;
    else if (character === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;

  const [nameToken = '', ...paramTokens] = splitUnquoted(line.slice(0, colon), ';');
  const dot = nameToken.indexOf('.');
  const group = dot >= 0 ? nameToken.slice(0, dot).trim() : '';
  const name = (dot >= 0 ? nameToken.slice(dot + 1) : nameToken).trim().toUpperCase();
  if (name === '') return null;

  const params: VcardParam[] = [];
  for (const token of paramTokens) {
    const equals = token.indexOf('=');
    if (equals < 0) {
      // vCard 2.1 shorthand: a bare parameter is a TYPE.
      const value = unquote(token);
      if (value !== '') params.push({ name: 'TYPE', values: [value] });
      continue;
    }
    const values = splitUnquoted(token.slice(equals + 1), ',')
      // A quoted TYPE may hold the whole comma-separated list: TYPE="work,voice".
      .flatMap((part) => unquote(part).split(','))
      .map((part) => part.trim())
      .filter((part) => part !== '');
    params.push({ name: token.slice(0, equals).trim().toUpperCase(), values });
  }

  return { group, name, params, value: line.slice(colon + 1) };
}

function paramValues(property: VcardProperty, name: string): string[] {
  return property.params.filter((p) => p.name === name).flatMap((p) => p.values);
}

// ── labels ────────────────────────────────────────────────────────────────

/** TYPE values that say what kind of number it is, mapped to our labels. */
const TYPE_TO_LABEL: Record<string, string> = {
  home: 'home',
  work: 'work',
  cell: 'mobile',
  mobile: 'mobile',
  iphone: 'mobile',
  main: 'main',
  fax: 'fax',
  pager: 'pager',
  other: 'other',
  school: 'school',
};

/** TYPE values that classify the medium rather than label it. */
const TYPE_NOISE = new Set([
  'internet',
  'pref',
  'voice',
  'text',
  'video',
  'textphone',
  'msg',
  'x400',
  'parcel',
  'postal',
  'dom',
  'intl',
]);

/** Our labels that have a different spelling as a vCard TYPE. */
const LABEL_TO_TYPE: Record<string, string> = { mobile: 'cell' };

function labelFromTypes(types: readonly string[]): string {
  for (const raw of types) {
    const type = normalizeLabel(raw);
    if (type === '' || TYPE_NOISE.has(type)) continue;
    return TYPE_TO_LABEL[type] ?? type;
  }
  return '';
}

/** Apple wraps its standard labels: `_$!<Home>!$_`. */
function unwrapAbLabel(value: string): string {
  const match = /^_\$!<(.*)>!\$_$/.exec(value.trim());
  return normalizeLabel(match?.[1] ?? value);
}

function labelOf(property: VcardProperty, groupLabels: Map<string, string>): string {
  const grouped = property.group === '' ? undefined : groupLabels.get(property.group);
  if (grouped !== undefined && grouped !== '') return grouped;
  return labelFromTypes(paramValues(property, 'TYPE'));
}

function typeParam(label: string, version: VcardVersion): string | null {
  const normalized = normalizeLabel(label);
  if (normalized === '') return null;
  const token = LABEL_TO_TYPE[normalized] ?? normalized;
  const spelled = version === '3.0' ? token.toUpperCase() : token;
  const needsQuotes = /[,;:\s]/.test(spelled);
  return `TYPE=${needsQuotes ? `"${spelled}"` : spelled}`;
}

// ── dates ─────────────────────────────────────────────────────────────────

/** `1980-05-04`, `19800504` and `1980-05-04T00:00:00Z` all mean the same day. */
export function parseVcardDate(value: string): string {
  const text = unescapeText(value).trim();
  const extended = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const basic = /^(\d{4})(\d{2})(\d{2})/.exec(text);
  const match = extended ?? basic;
  if (!match) return '';
  const [, year = '', month = '', day = ''] = match;
  return normalizeBirthday(`${year}-${month}-${day}`);
}

/**
 * Timestamps are written in extended ISO 8601 with milliseconds, so a REV
 * survives the round trip exactly; the basic form other exporters use is read
 * as well.
 */
function parseTimestamp(value: string): number | null {
  const text = unescapeText(value).trim();
  const basic = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}:?\d{2})?$/.exec(text);
  const iso = basic
    ? `${basic[1]}-${basic[2]}-${basic[3]}T${basic[4]}:${basic[5]}:${basic[6]}${basic[7] ?? 'Z'}`
    : text;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

// ── parsing ───────────────────────────────────────────────────────────────

function readAddress(property: VcardProperty, label: string): PostalAddress | null {
  const parts = splitStructured(property.value);
  const at = (index: number) => (parts[index] ?? '').trim();
  // Components 0 and 1 are the post office box and the extended address; the
  // model has no field for either, so they join the street rather than vanish.
  const street = [at(0), at(1), at(2)].filter(Boolean).join(', ');
  const address: PostalAddress = {
    label,
    street,
    city: at(3),
    region: at(4),
    postcode: at(5),
    country: at(6),
  };
  const filled = `${address.street}${address.city}${address.region}${address.postcode}${address.country}`;
  return filled === '' ? null : address;
}

/** `value` is already unescaped. */
function labelled(value: string, label: string): LabelledValue | null {
  const text = value.trim();
  return text === '' ? null : { label, value: text };
}

function buildContact(properties: readonly VcardProperty[], id: string, now: number): Contact {
  const contact = emptyContact(id, now);

  const groupLabels = new Map<string, string>();
  for (const property of properties) {
    if (property.name === 'X-ABLABEL' && property.group !== '') {
      groupLabels.set(property.group, unwrapAbLabel(unescapeText(property.value)));
    }
  }

  let fullName = '';
  let created: number | null = null;
  let revised: number | null = null;

  for (const property of properties) {
    const label = labelOf(property, groupLabels);
    switch (property.name) {
      case 'UID': {
        const uid = unescapeText(property.value).trim();
        if (uid !== '') contact.id = uid;
        break;
      }
      case 'N': {
        const parts = splitStructured(property.value).map((part) => part.trim());
        const [family = '', given = '', additional = ''] = parts;
        // Middle names have no field of their own; they read as part of the
        // given name rather than disappearing.
        contact.given = [given, additional].filter(Boolean).join(' ');
        contact.family = family;
        break;
      }
      case 'FN':
        fullName = unescapeText(property.value).trim();
        break;
      case 'NICKNAME':
        if (contact.nickname === '') {
          contact.nickname = splitList(property.value)
            .map((part) => part.trim())
            .filter(Boolean)
            .join(', ');
        }
        break;
      case 'ORG':
        if (contact.organisation === '') {
          contact.organisation = splitStructured(property.value)
            .map((part) => part.trim())
            .filter(Boolean)
            .join(', ');
        }
        break;
      case 'TITLE':
      case 'ROLE':
        if (contact.title === '') contact.title = unescapeText(property.value).trim();
        break;
      case 'EMAIL': {
        const entry = labelled(unescapeText(property.value), label);
        if (entry) contact.emails.push(entry);
        break;
      }
      case 'TEL': {
        // vCard 4.0 prefers a tel: URI, whose own parameters ride after an
        // unescaped semicolon — `tel:+15551234;ext=101`. The number is what a
        // person reads, so take the first component and drop the scheme.
        const raw = splitStructured(property.value)[0] ?? '';
        const entry = labelled(raw.trim().replace(/^tel:/i, ''), label);
        if (entry) contact.phones.push(entry);
        break;
      }
      case 'ADR': {
        const address = readAddress(property, label);
        if (address) contact.addresses.push(address);
        break;
      }
      case 'URL': {
        const entry = labelled(unescapeText(property.value), label);
        if (entry) contact.urls.push(entry);
        break;
      }
      case 'BDAY':
        if (contact.birthday === '') contact.birthday = parseVcardDate(property.value);
        break;
      case 'NOTE':
        if (contact.notes === '') contact.notes = unescapeText(property.value);
        break;
      case 'CATEGORIES':
        contact.groups = normalizeGroups([...contact.groups, ...splitList(property.value)]);
        break;
      case 'X-LUMEN-PHOTO': {
        const path = unescapeText(property.value).trim();
        if (path !== '') contact.photo = path;
        break;
      }
      case 'PHOTO': {
        // A photo here is a path in the VFS, so an embedded image and a remote
        // URL both have nowhere to live: only a plain absolute path is kept,
        // and base64 payloads start with "/" often enough to check ENCODING.
        const encoded = paramValues(property, 'ENCODING').length > 0;
        const path = unescapeText(property.value).trim();
        if (contact.photo === null && !encoded && path.startsWith('/')) contact.photo = path;
        break;
      }
      case 'X-LUMEN-FAVOURITE': {
        const flag = unescapeText(property.value).trim().toLowerCase();
        contact.favourite = flag === '1' || flag === 'true' || flag === 'yes';
        break;
      }
      case 'X-LUMEN-CREATED':
        created = parseTimestamp(property.value);
        break;
      case 'REV':
        revised = parseTimestamp(property.value);
        break;
      default:
        break;
    }
  }

  // FN is only a name when N did not give one. A card for a company repeats
  // the organisation in FN, and splitting that into given and family would be
  // an invention.
  if (contact.given === '' && contact.family === '' && fullName !== '') {
    if (fullName !== contact.organisation) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      contact.given = parts[0] ?? '';
      contact.family = parts.slice(1).join(' ');
    }
  }

  contact.createdAt = created ?? revised ?? now;
  contact.updatedAt = revised ?? contact.createdAt;
  return contact;
}

/** Every card in a file. Anything outside BEGIN/END:VCARD is ignored. */
export function parseVcards(text: string, options: ParseOptions = {}): Contact[] {
  const now = options.now ?? Date.now();
  const makeId = options.makeId ?? ((index: number) => `vcard-${now.toString(36)}-${index}`);
  const contacts: Contact[] = [];
  let open: VcardProperty[] | null = null;

  for (const line of unfold(text)) {
    if (line.trim() === '') continue;
    const property = parseProperty(line);
    if (!property) continue;
    if (
      property.name === 'BEGIN' &&
      unescapeText(property.value).trim().toUpperCase() === 'VCARD'
    ) {
      open = [];
      continue;
    }
    if (property.name === 'END' && unescapeText(property.value).trim().toUpperCase() === 'VCARD') {
      if (open) contacts.push(buildContact(open, makeId(contacts.length), now));
      open = null;
      continue;
    }
    if (open) open.push(property);
  }
  return contacts;
}

// ── serialising ───────────────────────────────────────────────────────────

function line(name: string, value: string, params: Array<string | null> = []): string {
  const suffix = params.filter((p): p is string => p !== null).map((p) => `;${p}`);
  return `${name}${suffix.join('')}:${value}`;
}

function structured(parts: readonly string[]): string {
  return parts.map(escapeText).join(';');
}

function serialiseBirthday(birthday: string, version: VcardVersion): string {
  return version === '4.0' ? birthday.replace(/-/g, '') : birthday;
}

/** One card, CRLF-terminated and folded. */
export function serialiseVcard(contact: Contact, options: SerialiseOptions = {}): string {
  const version = options.version ?? '4.0';
  const lines: string[] = ['BEGIN:VCARD', `VERSION:${version}`];
  if (version === '4.0') lines.push('KIND:individual');

  lines.push(line('N', structured([contact.family, contact.given, '', '', ''])));
  lines.push(line('FN', escapeText(displayName(contact))));
  if (contact.nickname !== '') lines.push(line('NICKNAME', escapeText(contact.nickname)));
  if (contact.organisation !== '') lines.push(line('ORG', structured([contact.organisation])));
  if (contact.title !== '') lines.push(line('TITLE', escapeText(contact.title)));

  for (const phone of contact.phones) {
    lines.push(line('TEL', escapeText(phone.value), [typeParam(phone.label, version)]));
  }
  for (const email of contact.emails) {
    const type = typeParam(email.label, version);
    // 3.0 spells the medium out; 4.0 dropped it as the default.
    const params = version === '3.0' ? [type ? `${type},INTERNET` : 'TYPE=INTERNET'] : [type];
    lines.push(line('EMAIL', escapeText(email.value), params));
  }
  for (const address of contact.addresses) {
    const value = structured([
      '',
      '',
      address.street,
      address.city,
      address.region,
      address.postcode,
      address.country,
    ]);
    lines.push(line('ADR', value, [typeParam(address.label, version)]));
  }
  for (const url of contact.urls) {
    lines.push(line('URL', escapeText(url.value), [typeParam(url.label, version)]));
  }

  if (contact.birthday !== '') {
    lines.push(line('BDAY', serialiseBirthday(contact.birthday, version)));
  }
  if (contact.notes !== '') lines.push(line('NOTE', escapeText(contact.notes)));
  if (contact.groups.length > 0) {
    lines.push(line('CATEGORIES', contact.groups.map(escapeText).join(',')));
  }

  lines.push(line('UID', escapeText(contact.id)));
  lines.push(line('REV', new Date(contact.updatedAt).toISOString()));
  lines.push(line('X-LUMEN-CREATED', new Date(contact.createdAt).toISOString()));
  if (contact.favourite) lines.push('X-LUMEN-FAVOURITE:1');
  if (contact.photo !== null) lines.push(line('X-LUMEN-PHOTO', escapeText(contact.photo)));

  lines.push('END:VCARD');
  return `${lines.map((entry) => foldLine(entry)).join('\r\n')}\r\n`;
}

export function serialiseVcards(
  contacts: readonly Contact[],
  options: SerialiseOptions = {},
): string {
  return contacts.map((contact) => serialiseVcard(contact, options)).join('');
}

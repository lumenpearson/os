/**
 * Every string the mailbox turns a value into: addresses as people read them,
 * dates near and far, attachment sizes, and the one-line snippet the message
 * list prints under a subject.
 *
 * Dates go through `Intl` with the user's locale, clock preference and time
 * zone, so a message stamped at 23:40 in Tokyo reads as 23:40 there.
 */

import { formatBytes } from '@lumen/vfs';

export interface FormatOptions {
  locale: string;
  /** From `settings.menubar.clock24h`, inverted. */
  hour12: boolean;
  /** From `settings.region.timeZone`; empty means the host's zone. */
  timeZone?: string | undefined;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(o: FormatOptions, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${o.locale}|${o.timeZone ?? ''}|${JSON.stringify(options)}`;
  const found = cache.get(key);
  if (found) return found;
  const made = new Intl.DateTimeFormat(o.locale, {
    ...options,
    timeZone: o.timeZone === '' ? undefined : o.timeZone,
  });
  cache.set(key, made);
  return made;
}

// ── addresses ─────────────────────────────────────────────────────────────

export interface Address {
  /** The display name, or "" when the address carries none. */
  name: string;
  /** The bare address, or "" when the input has nothing address-shaped. */
  email: string;
}

/** `Ada Lovelace <ada@local>` → `{ name: 'Ada Lovelace', email: 'ada@local' }`. */
export function parseAddress(input: string): Address {
  const raw = input.trim();
  const angled = /^(.*)<([^<>]*)>\s*$/.exec(raw);
  if (angled) {
    const name = (angled[1] ?? '')
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim();
    return { name, email: (angled[2] ?? '').trim() };
  }
  return raw.includes('@') ? { name: '', email: raw } : { name: raw, email: '' };
}

/** What a person is called: the display name, falling back to the address. */
export function displayAddress(input: string): string {
  const { name, email } = parseAddress(input);
  return name || email || input.trim();
}

/** The bare address, for comparing two people. */
export function addressEmail(input: string): string {
  const { name, email } = parseAddress(input);
  return email || (name.includes('@') ? name : '');
}

/** "Ada, Grace and 2 more" — a recipient line that fits on one row. */
export function formatAddressList(list: readonly string[], max = 2): string {
  const names = list.map(displayAddress).filter((n) => n !== '');
  if (names.length === 0) return '';
  if (names.length <= max) {
    if (names.length === 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** Whether an address names the same person, ignoring case and display name. */
export function sameAddress(a: string, b: string): boolean {
  const left = addressEmail(a).toLowerCase();
  const right = addressEmail(b).toLowerCase();
  if (left !== '' && right !== '') return left === right;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ── sizes ─────────────────────────────────────────────────────────────────

/** "18 KB". Zero and nonsense both read as "—" rather than a fake number. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  return formatBytes(bytes);
}

/** "3 files · 1.2 MB" for the attachment strip. */
export function formatAttachmentSummary(count: number, bytes: number): string {
  const files = count === 1 ? '1 file' : `${count} files`;
  return `${files} · ${formatSize(bytes)}`;
}

// ── dates ─────────────────────────────────────────────────────────────────

/** The civil date at an instant, as YYYY-MM-DD in the chosen zone. */
function dayKey(at: number, o: FormatOptions): string {
  const parts = formatter(o, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(at),
  );
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year').padStart(4, '0')}-${pick('month')}-${pick('day')}`;
}

/** Days since the epoch for a YYYY-MM-DD key, so two days can be subtracted. */
function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

export function formatClockTime(at: number, o: FormatOptions): string {
  return formatter(
    o,
    o.hour12
      ? { hour: 'numeric', minute: '2-digit', hour12: true }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  ).format(new Date(at));
}

/**
 * The stamp in a message row: a time today, "Yesterday", a weekday inside the
 * last week, then a date — with the year once the message is from another one.
 */
export function formatStamp(at: number, now: number, o: FormatOptions): string {
  const then = dayNumber(dayKey(at, o));
  const today = dayNumber(dayKey(now, o));
  const days = today - then;
  if (days === 0) return formatClockTime(at, o);
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return formatter(o, { weekday: 'long' }).format(new Date(at));
  const sameYear = dayKey(at, o).slice(0, 4) === dayKey(now, o).slice(0, 4);
  return formatter(o, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(new Date(at));
}

/** The full stamp in the reading pane: "4 September 2026 at 09:41". */
export function formatFullStamp(at: number, o: FormatOptions): string {
  const date = formatter(o, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(at),
  );
  return `${date} at ${formatClockTime(at, o)}`;
}

/** The attribution line a reply quotes under. */
export function formatAttribution(at: number, from: string, o: FormatOptions): string {
  return `On ${formatFullStamp(at, o)}, ${displayAddress(from)} wrote:`;
}

// ── bodies ────────────────────────────────────────────────────────────────

const ATTRIBUTION = /^\s*On\b.*\bwrote:\s*$/;
const FORWARD_HEADER = /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/i;

/**
 * The message with its quoted history taken off: lines a client marked with
 * ">", the attribution line above them, everything after a "--" signature
 * delimiter, and a forwarded-message header block.
 */
export function stripQuotedText(body: string): string {
  const kept: string[] = [];
  for (const line of body.split('\n')) {
    if (/^\s*--\s*$/.test(line)) break;
    if (FORWARD_HEADER.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    if (ATTRIBUTION.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

/** One line of the message for the list row, quoted history left out. */
export function snippet(body: string, max = 160): string {
  const flat = stripQuotedText(body).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export interface BodyBlock {
  quoted: boolean;
  text: string;
}

/**
 * The body split into runs of quoted and unquoted lines, with one level of
 * "> " taken off the quoted ones. The reading pane sets a quoted run behind a
 * rule instead of printing the marks, which is what the marks were for.
 */
export function bodyBlocks(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const line of body.split('\n')) {
    const quoted = /^\s*>/.test(line);
    const text = quoted ? line.replace(/^\s*>\s?/, '') : line;
    const last = blocks[blocks.length - 1];
    if (last && last.quoted === quoted) last.text += `\n${text}`;
    else blocks.push({ quoted, text });
  }
  return blocks;
}

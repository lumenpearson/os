/**
 * Turning captured values into text: the clock a row prints, the flattened
 * tree an expanded row prints, and the serialisation the export writes.
 * Nothing here touches the DOM or the kernel.
 */
import type { LogLevel, LogRecord } from './types';

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** The row clock: local time to the millisecond, fixed width. */
export function formatClock(timestamp: number): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '--:--:--.---';
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
}

/** The export stamp: local date and time to the millisecond. */
export function formatStamp(timestamp: number): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
  return `${date} ${formatClock(timestamp)}`;
}

const MAX_TEXT = 160;

/** Cut long text to a readable length, marking that it was cut. */
export function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** A row is one line high, so a message with newlines is shown collapsed. */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function constructorName(value: object): string {
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto === null || typeof proto !== 'object') return '';
  const ctor: unknown = (proto as { constructor?: unknown }).constructor;
  return typeof ctor === 'function' ? ctor.name : '';
}

/** Containers this module walks into. Everything else prints as one value. */
function isWalkable(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  return !(
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Error
  );
}

function containerLabel(value: object): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  const name = constructorName(value);
  const body = Object.keys(value).length === 0 ? '{}' : '{…}';
  return name && name !== 'Object' ? `${name} ${body}` : body;
}

/** One value on one line, for a row message or a leaf of the tree. */
export function previewValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return JSON.stringify(clip(value));
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      return value.name ? `[function ${value.name}]` : '[function]';
  }
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }
  if (value instanceof RegExp) return String(value);
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  return containerLabel(value);
}

/** One line of the payload tree. Indentation is the depth, not the text. */
export interface PayloadLine {
  depth: number;
  /** The property name, or null for a bare line (a stack frame). */
  key: string | null;
  value: string;
}

export interface FlattenOptions {
  /** Levels walked into before a container prints as one value. */
  maxDepth?: number;
  /** Lines produced before the rest is summarised. */
  maxLines?: number;
}

/**
 * A value as a flat list of indented lines: objects and arrays become their
 * entries, an Error becomes its message, its stack and its own properties.
 * Depth, line count and cycles are all bounded, so any payload is safe to
 * render at a known height.
 */
export function flattenPayload(value: unknown, options: FlattenOptions = {}): PayloadLine[] {
  const maxDepth = Math.max(0, options.maxDepth ?? 4);
  const maxLines = Math.max(1, options.maxLines ?? 200);
  const lines: PayloadLine[] = [];
  const seen = new Set<object>();
  let skipped = 0;

  const push = (depth: number, key: string | null, text: string) => {
    if (lines.length < maxLines) lines.push({ depth, key, value: text });
    else skipped += 1;
  };

  const walkError = (error: Error, depth: number) => {
    push(depth, 'message', JSON.stringify(clip(error.message)));
    const stack = typeof error.stack === 'string' ? error.stack : '';
    const frames = stack
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('at '));
    if (frames.length > 0) {
      push(depth, 'stack', '');
      for (const frame of frames) push(depth + 1, null, frame);
    }
    for (const key of Object.keys(error)) {
      walk((error as unknown as Record<string, unknown>)[key], key, depth + 1);
    }
  };

  const walkEntries = (container: object, depth: number) => {
    seen.add(container);
    if (Array.isArray(container)) {
      for (let i = 0; i < container.length; i++) walk(container[i], `[${i}]`, depth);
    } else {
      for (const key of Object.keys(container)) {
        walk((container as Record<string, unknown>)[key], key, depth);
      }
    }
    seen.delete(container);
  };

  function walk(current: unknown, key: string | null, depth: number): void {
    if (lines.length >= maxLines) {
      skipped += 1;
      return;
    }
    if (current instanceof Error) {
      push(depth, key, `${current.name}: ${current.message}`);
      walkError(current, depth + 1);
      return;
    }
    if (!isWalkable(current)) {
      push(depth, key, previewValue(current));
      return;
    }
    if (seen.has(current)) {
      push(depth, key, '[circular]');
      return;
    }
    if (depth >= maxDepth) {
      push(depth, key, containerLabel(current));
      return;
    }
    push(depth, key, containerLabel(current));
    walkEntries(current, depth + 1);
  }

  // The root container is the payload itself, so its entries start at the
  // left margin instead of under a header that says nothing.
  if (value instanceof Error) {
    push(0, null, `${value.name}: ${value.message}`);
    walkError(value, 1);
  } else if (isWalkable(value)) {
    walkEntries(value, 0);
    if (lines.length === 0) push(0, null, Array.isArray(value) ? '[]' : '{}');
  } else {
    push(0, null, previewValue(value));
  }

  if (skipped > 0) lines.push({ depth: 0, key: null, value: `+${skipped} more` });
  return lines;
}

/** A payload line as text, for the export and for Copy. */
export function payloadLineText(line: PayloadLine, indent = 4): string {
  const margin = ' '.repeat(indent + line.depth * 2);
  if (line.key === null) return `${margin}${line.value}`;
  return line.value === '' ? `${margin}${line.key}:` : `${margin}${line.key}: ${line.value}`;
}

/**
 * `console.log('count', 3, err)` becomes the message "count 3 TypeError: …"
 * and keeps the objects as the payload, so nothing printed is lost.
 */
export function formatConsoleArgs(args: readonly unknown[]): { message: string; data?: unknown } {
  const parts: string[] = [];
  const structured: unknown[] = [];
  for (const arg of args) {
    parts.push(typeof arg === 'string' ? arg : previewValue(arg));
    if (arg !== null && (typeof arg === 'object' || typeof arg === 'function')) {
      structured.push(arg);
    }
  }
  const message = parts.join(' ');
  if (structured.length === 0) return { message };
  return { message, data: structured.length === 1 ? structured[0] : structured };
}

/** What was thrown, as a message and a payload. Anything can be thrown. */
export function describeThrown(value: unknown): { message: string; data?: unknown } {
  if (value instanceof Error) return { message: `${value.name}: ${value.message}`, data: value };
  if (typeof value === 'string') return { message: value };
  if (value !== null && typeof value === 'object') {
    return { message: previewValue(value), data: value };
  }
  return { message: previewValue(value) };
}

const LEVEL_WIDTH = 5;

/** One record as it appears in an exported `.log` file. */
export function serializeRecord(record: LogRecord, options: FlattenOptions = {}): string {
  const level = record.level.padEnd(LEVEL_WIDTH);
  const message = record.message.split('\n').join('\n    ');
  const head = `${formatStamp(record.timestamp)}  ${level}  ${record.source}  ${message}`;
  if (record.data === undefined) return head;
  const payload = flattenPayload(record.data, options).map((line) => payloadLineText(line));
  return [head, ...payload].join('\n');
}

export interface ExportMeta {
  exportedAt: number;
  /** Records the buffer held; the file has the filtered ones. */
  captured: number;
  levels: readonly LogLevel[];
  /** null means every source. */
  sources: readonly string[] | null;
  /** The search box as typed. */
  search: string;
}

/** The filtered view as a `.log` file: a header of what was kept, then rows. */
export function serializeLog(records: readonly LogRecord[], meta: ExportMeta): string {
  const header = [
    '# Lumen Console',
    `# exported ${formatStamp(meta.exportedAt)}`,
    `# ${records.length} of ${meta.captured} captured entries`,
    `# levels ${meta.levels.length > 0 ? meta.levels.join(',') : 'none'}`,
    `# sources ${meta.sources === null ? 'all' : meta.sources.join(',')}`,
  ];
  if (meta.search) header.push(`# search ${meta.search}`);
  return [...header, ...records.map((record) => serializeRecord(record)), ''].join('\n');
}

/**
 * What the window keeps between sessions, in ~/.config/workbench.json: the
 * tool that was open, each tool's options, and what was in its fields.
 *
 * Keeping the input is the point — a developer comes back to the window with
 * the JSON they were staring at still there — but a settings file is not a
 * document store, so every text field is capped. The file is text a user can
 * edit, so nothing read out of it is trusted.
 */

import { CODECS, type Codec } from './encode';
import { EPOCH_UNITS, type EpochUnit, UTC } from './epoch';
import { HASHES, type HashAlgorithm } from './hash';
import { ID_KINDS, type IdKind } from './ids';
import type { IndentId } from './json';
import { isToolId, type ToolId } from './tools';

/** Characters kept per field. Past this the tail is dropped on the next save. */
export const MAX_FIELD = 100_000;

export const INDENTS: readonly IndentId[] = ['2', '4', 'tab', 'minified'];

export const INDENT_LABEL: Record<IndentId, string> = {
  '2': '2 spaces',
  '4': '4 spaces',
  tab: 'Tab',
  minified: 'Minified',
};

export type Direction = 'encode' | 'decode';

export interface JsonState {
  input: string;
  indent: IndentId;
  sortKeys: boolean;
  query: string;
}

export interface RegexState {
  pattern: string;
  flags: string;
  subject: string;
  replacement: string;
}

export interface DiffState {
  left: string;
  right: string;
}

export interface EncodeState {
  codec: Codec;
  direction: Direction;
  input: string;
}

export interface IdsState {
  kind: IdKind;
  count: number;
}

export interface TimeState {
  input: string;
  unit: EpochUnit;
  /** Empty means "the zone this machine is set to". */
  zone: string;
}

export interface HashState {
  algorithm: HashAlgorithm;
  input: string;
}

export interface WorkbenchData {
  tool: ToolId;
  json: JsonState;
  regex: RegexState;
  diff: DiffState;
  encode: EncodeState;
  ids: IdsState;
  time: TimeState;
  hash: HashState;
}

export const MAX_IDS = 100;

export const DEFAULT_DATA: WorkbenchData = {
  tool: 'json',
  json: { input: '', indent: '2', sortKeys: false, query: '' },
  regex: { pattern: '', flags: 'g', subject: '', replacement: '' },
  diff: { left: '', right: '' },
  encode: { codec: 'base64', direction: 'encode', input: '' },
  ids: { kind: 'uuid', count: 5 },
  time: { input: '', unit: 'auto', zone: '' },
  hash: { algorithm: 'SHA-256', input: '' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value.slice(0, MAX_FIELD) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

const whole = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
};

/** Only the flags a regular expression accepts, each at most once. */
export function normalizeFlags(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const kept = [...new Set([...value])].filter((flag) => 'gimsuy'.includes(flag));
  return kept.join('');
}

export function normalizeData(raw: unknown): WorkbenchData {
  if (!isRecord(raw)) return DEFAULT_DATA;
  const section = (key: keyof WorkbenchData) => (isRecord(raw[key]) ? raw[key] : {});
  const json = section('json');
  const regex = section('regex');
  const diff = section('diff');
  const encode = section('encode');
  const ids = section('ids');
  const time = section('time');
  const hash = section('hash');

  return {
    tool: isToolId(raw.tool) ? raw.tool : DEFAULT_DATA.tool,
    json: {
      input: text(json.input, DEFAULT_DATA.json.input),
      indent: oneOf(json.indent, INDENTS, DEFAULT_DATA.json.indent),
      sortKeys: bool(json.sortKeys, DEFAULT_DATA.json.sortKeys),
      query: text(json.query, DEFAULT_DATA.json.query),
    },
    regex: {
      pattern: text(regex.pattern, DEFAULT_DATA.regex.pattern),
      flags: normalizeFlags(regex.flags, DEFAULT_DATA.regex.flags),
      subject: text(regex.subject, DEFAULT_DATA.regex.subject),
      replacement: text(regex.replacement, DEFAULT_DATA.regex.replacement),
    },
    diff: {
      left: text(diff.left, DEFAULT_DATA.diff.left),
      right: text(diff.right, DEFAULT_DATA.diff.right),
    },
    encode: {
      codec: oneOf(encode.codec, CODECS, DEFAULT_DATA.encode.codec),
      direction: oneOf<Direction>(
        encode.direction,
        ['encode', 'decode'],
        DEFAULT_DATA.encode.direction,
      ),
      input: text(encode.input, DEFAULT_DATA.encode.input),
    },
    ids: {
      kind: oneOf<IdKind>(ids.kind, ID_KINDS, DEFAULT_DATA.ids.kind),
      count: whole(ids.count, DEFAULT_DATA.ids.count, 1, MAX_IDS),
    },
    time: {
      input: text(time.input, DEFAULT_DATA.time.input),
      unit: oneOf<EpochUnit>(time.unit, EPOCH_UNITS, DEFAULT_DATA.time.unit),
      zone: text(time.zone, DEFAULT_DATA.time.zone).slice(0, 64),
    },
    hash: {
      algorithm: oneOf<HashAlgorithm>(hash.algorithm, HASHES, DEFAULT_DATA.hash.algorithm),
      input: text(hash.input, DEFAULT_DATA.hash.input),
    },
  };
}

/**
 * Empty a tool's fields, keeping its options. Clearing a pane should not also
 * forget that you work in tabs and sort your keys.
 */
export function clearTool(data: WorkbenchData, tool: ToolId): WorkbenchData {
  switch (tool) {
    case 'json':
      return { ...data, json: { ...data.json, input: '', query: '' } };
    case 'regex':
      return { ...data, regex: { ...data.regex, pattern: '', subject: '', replacement: '' } };
    case 'diff':
      return { ...data, diff: { left: '', right: '' } };
    case 'encode':
      return { ...data, encode: { ...data.encode, input: '' } };
    case 'ids':
      return data;
    case 'time':
      return { ...data, time: { ...data.time, input: '' } };
    case 'hash':
      return { ...data, hash: { ...data.hash, input: '' } };
  }
}

/** The zone the Time tool should use: the stored one, or the machine's. */
export function resolveZone(stored: string, system: string): string {
  if (stored !== '') return stored;
  return system === '' ? UTC : system;
}

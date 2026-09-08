import { describe, expect, it } from 'vitest';
import {
  type CalculatorData,
  DEFAULT_DATA,
  MODE_LABEL,
  MODES,
  normalizeData,
  pushTape,
  TAPE_LIMIT,
  type TapeEntry,
} from './storage';

const entry = (n: number): TapeEntry => ({ expression: `${n}+1`, result: `${n + 1}`, at: n });

describe('normalizeData', () => {
  it('keeps a file that is already valid', () => {
    const stored: CalculatorData = {
      mode: 'programmer',
      angle: 'rad',
      base: 'bin',
      wordSize: 64,
      showTape: true,
      memory: 12.5,
      tape: [entry(1)],
    };
    expect(normalizeData(stored)).toEqual(stored);
  });

  it('falls back to the defaults for anything missing', () => {
    expect(normalizeData({})).toEqual(DEFAULT_DATA);
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
    expect(normalizeData('nonsense')).toEqual(DEFAULT_DATA);
    expect(normalizeData([])).toEqual({ ...DEFAULT_DATA, tape: [] });
  });

  it('refuses values outside the sets it knows', () => {
    const data = normalizeData({ mode: 'quantum', angle: 'grad', base: 'b64', wordSize: 12 });
    expect(data.mode).toBe(DEFAULT_DATA.mode);
    expect(data.angle).toBe(DEFAULT_DATA.angle);
    expect(data.base).toBe(DEFAULT_DATA.base);
    expect(data.wordSize).toBe(DEFAULT_DATA.wordSize);
  });

  it('refuses a memory that is not a real number', () => {
    expect(normalizeData({ memory: Number.NaN }).memory).toBe(0);
    expect(normalizeData({ memory: '5' }).memory).toBe(0);
    expect(normalizeData({ memory: -2.5 }).memory).toBe(-2.5);
  });

  it('drops tape lines that are not lines', () => {
    const data = normalizeData({ tape: [entry(1), null, { expression: 'x' }, 7, entry(2)] });
    expect(data.tape).toEqual([entry(1), entry(2)]);
  });

  it('gives a tape line without a time a time of zero', () => {
    const data = normalizeData({ tape: [{ expression: '1+1', result: '2' }] });
    expect(data.tape[0]).toEqual({ expression: '1+1', result: '2', at: 0 });
  });

  it('caps an over-long tape', () => {
    const tape = Array.from({ length: TAPE_LIMIT + 20 }, (_, i) => entry(i));
    expect(normalizeData({ tape }).tape).toHaveLength(TAPE_LIMIT);
  });

  it('labels every mode', () => {
    for (const mode of MODES) expect(MODE_LABEL[mode].length).toBeGreaterThan(0);
    expect(MODE_LABEL.programmer).toBe('Programmer');
  });
});

describe('pushTape', () => {
  it('puts the newest line first', () => {
    expect(pushTape([entry(1)], entry(2))).toEqual([entry(2), entry(1)]);
  });

  it('drops the oldest line past the limit', () => {
    const full = Array.from({ length: TAPE_LIMIT }, (_, i) => entry(i));
    const next = pushTape(full, entry(999));
    expect(next).toHaveLength(TAPE_LIMIT);
    expect(next[0]).toEqual(entry(999));
    expect(next.at(-1)).toEqual(entry(TAPE_LIMIT - 2));
  });

  it('takes its own limit', () => {
    expect(pushTape([entry(1), entry(2)], entry(3), 2)).toEqual([entry(3), entry(1)]);
    expect(pushTape([entry(1)], entry(2), 0)).toEqual([]);
  });

  it('leaves the tape it was given alone', () => {
    const tape = [entry(1)];
    pushTape(tape, entry(2));
    expect(tape).toEqual([entry(1)]);
  });
});

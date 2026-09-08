import { isInside } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import { describeExtraction, planExtraction } from './operations';
import type { ZipEntry } from './zip';

const entry = (name: string, isDirectory = false): ZipEntry => ({
  name,
  isDirectory,
  method: 0,
  crc: 0,
  compressedSize: 0,
  uncompressedSize: 0,
  modifiedAt: 0,
  encrypted: false,
  comment: '',
  headerOffset: 0,
  dataStart: 0,
  dataEnd: 0,
});

const dest = '/Users/lumen/Extracted';

describe('planExtraction', () => {
  it('puts each entry under the destination', () => {
    const plan = planExtraction([entry('a.txt'), entry('docs/b.txt')], [0, 1], dest);
    expect(plan.writes.map((w) => w.target)).toEqual([`${dest}/a.txt`, `${dest}/docs/b.txt`]);
    expect(plan.refused).toEqual([]);
  });

  it('plans only the entries it was given, in that order', () => {
    const entries = [entry('a.txt'), entry('b.txt'), entry('c.txt')];
    expect(planExtraction(entries, [2, 0], dest).writes.map((w) => w.index)).toEqual([2, 0]);
  });

  it('never plans a write outside the destination', () => {
    const entries = [
      entry('../../etc/passwd'),
      entry('/etc/shadow'),
      entry('C:\\Windows\\system32\\drivers\\etc\\hosts'),
      entry('a/../../b'),
      entry('..\\..\\x'),
    ];
    const plan = planExtraction(entries, [0, 1, 2, 3, 4], dest);
    expect(plan.writes).toHaveLength(5);
    for (const write of plan.writes) {
      expect(isInside(dest, write.target), write.entry.name).toBe(true);
    }
  });

  it('refuses a name with nothing usable left, and says which', () => {
    const plan = planExtraction([entry('...'), entry('ok.txt'), entry('..')], [0, 1, 2], dest);
    expect(plan.writes.map((w) => w.target)).toEqual([`${dest}/ok.txt`]);
    expect(plan.refused).toEqual(['...', '..']);
  });

  it('keeps the directory flag so the caller knows what to create', () => {
    const plan = planExtraction([entry('docs/', true)], [0], dest);
    expect(plan.writes[0]?.entry.isDirectory).toBe(true);
    expect(plan.writes[0]?.target).toBe(`${dest}/docs`);
  });

  it('ignores an index the archive does not have', () => {
    expect(planExtraction([entry('a.txt')], [0, 7, -1], dest).writes).toHaveLength(1);
  });

  it('plans nothing for an empty selection', () => {
    expect(planExtraction([entry('a.txt')], [], dest)).toEqual({ writes: [], refused: [] });
  });
});

describe('describeExtraction', () => {
  const base = { written: 4, refused: 0, failed: 0, firstFailure: null, destination: '/u/Out' };

  it('states the count and the destination', () => {
    expect(describeExtraction(base)).toBe('Extracted 4 items to /u/Out.');
  });

  it('uses the singular for one item', () => {
    expect(describeExtraction({ ...base, written: 1 })).toBe('Extracted 1 item to /u/Out.');
  });

  it('reports refused names alongside the successes', () => {
    expect(describeExtraction({ ...base, refused: 2 })).toBe(
      'Extracted 4 items to /u/Out. 2 unsafe names skipped.',
    );
  });

  it('reports failures with the first reason', () => {
    expect(
      describeExtraction({ ...base, failed: 1, firstFailure: '"a.txt" failed its checksum' }),
    ).toBe('Extracted 4 items to /u/Out. 1 entry failed: "a.txt" failed its checksum.');
  });

  it('says so plainly when nothing came out', () => {
    expect(describeExtraction({ ...base, written: 0, refused: 1 })).toBe(
      'Extracted 0 items to /u/Out. 1 unsafe name skipped.',
    );
  });
});

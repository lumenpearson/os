import { describe, expect, it } from 'vitest';
import { known, unknown } from './probe';
import { labelWidth, renderReport, renderSection, reportFileName } from './report';
import type { Section } from './sections';

const OVERVIEW: Section = {
  id: 'overview',
  title: 'Overview',
  rows: [
    { id: 'a', label: 'Version', fact: known('0.4.2'), note: 'Compiled in at build time.' },
    { id: 'b', label: 'Build target', fact: known('Web browser') },
    { id: 'c', label: 'Device name', fact: unknown('Browsers do not expose the computer’s name.') },
  ],
};

const PROCESSOR: Section = {
  id: 'processor',
  title: 'Processor',
  rows: [{ id: 'd', label: 'Logical cores', fact: known('8') }],
};

describe('labelWidth', () => {
  it('is the longest label', () => {
    expect(labelWidth(OVERVIEW.rows)).toBe(12);
  });

  it('is zero for a section with no rows', () => {
    expect(labelWidth([])).toBe(0);
  });
});

describe('renderSection', () => {
  const lines = renderSection(OVERVIEW);

  it('starts with the title and aligns the value column', () => {
    expect(lines[0]).toBe('Overview');
    expect(lines[1]).toBe('  Version       0.4.2');
    expect(lines[3]).toBe('  Build target  Web browser');
  });

  it('prints an em-dash and the reason for an unavailable row', () => {
    expect(lines[4]).toBe('  Device name   —');
    expect(lines[5]).toBe('                Browsers do not expose the computer’s name.');
  });

  it('puts the note under the value it qualifies', () => {
    expect(lines[2]).toBe('                Compiled in at build time.');
  });

  it('collapses whitespace so one row is always one line', () => {
    const messy = renderSection({
      id: 's',
      title: 'S',
      rows: [{ id: 'x', label: 'User agent', fact: known('Mozilla/5.0\n  (X11)') }],
    });
    expect(messy[1]).toBe('  User agent  Mozilla/5.0 (X11)');
  });
});

describe('renderReport', () => {
  const text = renderReport([OVERVIEW, PROCESSOR], {
    title: 'Lumen OS — System Report',
    collectedAtLabel: '4 Sept 2026 09:01',
  });

  it('opens with the title, the time and the count of missing values', () => {
    expect(text.split('\n').slice(0, 3)).toEqual([
      'Lumen OS — System Report',
      'Collected 4 Sept 2026 09:01',
      '4 values, 1 of them not available on this platform.',
    ]);
  });

  it('separates sections with a blank line and ends with a newline', () => {
    expect(text).toContain('\n\nProcessor\n');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('says so when every value was available', () => {
    const complete = renderReport([PROCESSOR], { title: 'T', collectedAtLabel: 'now' });
    expect(complete).toContain('1 values, all available on this platform.');
  });

  it('contains every label and value', () => {
    for (const row of [...OVERVIEW.rows, ...PROCESSOR.rows]) {
      expect(text).toContain(row.label);
      if (row.fact.available) expect(text).toContain(row.fact.value);
      else expect(text).toContain(row.fact.reason ?? '');
    }
  });
});

describe('reportFileName', () => {
  it('names the file after the day it was collected', () => {
    expect(reportFileName(Date.UTC(2026, 8, 4, 9, 0, 0))).toBe('System Report 2026-09-04.txt');
  });
});

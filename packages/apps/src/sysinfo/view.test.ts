import { describe, expect, it } from 'vitest';
import { known, REASONS, unknown } from './probe';
import type { FactRow, Section, StorageReading } from './sections';
import {
  countReadings,
  findRow,
  formatPercent,
  heroSubline,
  reportTitle,
  splitOverview,
  storageBar,
} from './view';

function row(id: string, label: string, available: boolean, value = 'x'): FactRow {
  return { id, label, fact: available ? known(value) : unknown('because') };
}

function overview(version: FactRow, build: FactRow): Section {
  return { id: 'overview', title: 'Overview', rows: [version, build] };
}

const SECTIONS: Section[] = [
  overview(row('overview.version', 'Version', true, '0.4.2'), {
    id: 'overview.build',
    label: 'Build target',
    fact: known('Web browser'),
  }),
  { id: 'processor', title: 'Processor', rows: [row('processor.model', 'Model', false)] },
  {
    id: 'memory',
    title: 'Memory',
    rows: [row('memory.total', 'Physical memory', false), row('memory.device', 'Device', true)],
  },
];

describe('splitOverview', () => {
  it('takes the overview out and keeps the rest in order', () => {
    const { overview: hero, rest } = splitOverview(SECTIONS);
    expect(hero?.id).toBe('overview');
    expect(rest.map((s) => s.id)).toEqual(['processor', 'memory']);
  });

  it('has no hero when nothing built one', () => {
    const { overview: hero, rest } = splitOverview([SECTIONS[1] as Section]);
    expect(hero).toBeNull();
    expect(rest).toHaveLength(1);
  });
});

describe('findRow', () => {
  it('finds a row by id', () => {
    expect(findRow(SECTIONS[0] as Section, 'overview.build')?.label).toBe('Build target');
  });

  it('is undefined for a missing row or a missing section', () => {
    expect(findRow(SECTIONS[0] as Section, 'overview.nothing')).toBeUndefined();
    expect(findRow(null, 'overview.build')).toBeUndefined();
  });
});

describe('heroSubline', () => {
  it('joins the version and the build target', () => {
    expect(heroSubline(SECTIONS[0] as Section)).toBe('0.4.2 · Web browser');
  });

  it('drops the half it does not have', () => {
    const section = overview(row('overview.version', 'Version', false), {
      id: 'overview.build',
      label: 'Build target',
      fact: known('Desktop (Tauri)'),
    });
    expect(heroSubline(section)).toBe('Desktop (Tauri)');
  });

  it('prints an em-dash rather than a guess when it has neither', () => {
    const section = overview(
      row('overview.version', 'Version', false),
      row('overview.build', 'Build target', false),
    );
    expect(heroSubline(section)).toBe('—');
    expect(heroSubline(null)).toBe('—');
  });
});

describe('reportTitle', () => {
  it('names the version the build carries', () => {
    expect(reportTitle(SECTIONS[0] as Section)).toBe('Lumen OS 0.4.2 — System Information');
  });

  it('leaves the version out when the bridge did not report one', () => {
    const section = overview(
      row('overview.version', 'Version', false),
      row('overview.build', 'Build target', true, 'Web browser'),
    );
    expect(reportTitle(section)).toBe('Lumen OS — System Information');
  });
});

describe('formatPercent', () => {
  it('rounds to a whole percent from ten up', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.1234)).toBe('12%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('keeps a decimal below ten percent', () => {
    expect(formatPercent(0.0342)).toBe('3.4%');
    expect(formatPercent(0.002)).toBe('0.2%');
  });

  it('never rounds a real figure down to nothing', () => {
    expect(formatPercent(0.0000004)).toBe('<0.1%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('storageBar', () => {
  const reading = (over: Partial<StorageReading> = {}): StorageReading => ({
    source: 'storage-api',
    used: 512 * 1024 ** 2,
    quota: 4 * 1024 ** 3,
    ...over,
  });

  it('draws used against quota', () => {
    const bar = storageBar(reading());
    expect(bar.fraction).toBeCloseTo(0.125, 5);
    expect(bar.caption).toBe('512 MB of 4.0 GB used (13%)');
    expect(bar.reason).toBeUndefined();
  });

  it('draws no bar without a quota, but still prints what is in use', () => {
    const bar = storageBar(reading({ quota: null }));
    expect(bar.fraction).toBeNull();
    expect(bar.caption).toBe('512 MB in use');
    expect(bar.reason).toBe(REASONS.quota);
  });

  it('draws no bar when neither source answered', () => {
    expect(storageBar(null)).toEqual({
      fraction: null,
      caption: '—',
      reason: REASONS.storage,
    });
  });

  it('refuses an impossible reading', () => {
    expect(storageBar(reading({ used: -1 })).reason).toBe(REASONS.storage);
    expect(storageBar(reading({ used: Number.NaN })).reason).toBe(REASONS.storage);
  });

  it('never overfills when usage exceeds the quota', () => {
    const bar = storageBar(reading({ used: 8 * 1024 ** 3 }));
    expect(bar.fraction).toBe(1);
  });
});

describe('countReadings', () => {
  it('counts every row and the ones with no value', () => {
    expect(countReadings(SECTIONS)).toEqual({ total: 5, missing: 2 });
  });

  it('counts nothing before the first reading', () => {
    expect(countReadings([])).toEqual({ total: 0, missing: 0 });
  });
});

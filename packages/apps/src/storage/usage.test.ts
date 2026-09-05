import { describe, expect, it } from 'vitest';
import { categoryTotals } from './categories';
import {
  browserBacked,
  buildSegments,
  buildUsageReport,
  coverageNote,
  formatShare,
  REASONS,
  segmentColor,
  type UsageSources,
} from './usage';

const MB = 1024 * 1024;

const sources = (patch: Partial<UsageSources> = {}): UsageSources => ({
  adapterId: 'indexeddb',
  adapter: { used: 40 * MB, quota: 400 * MB },
  browser: { usage: 40 * MB, quota: 400 * MB },
  ...patch,
});

describe('buildUsageReport', () => {
  it('prints what the file system reports and how full it is', () => {
    const report = buildUsageReport(sources());
    expect(report.used).toMatchObject({ value: '40.0 MB', available: true });
    expect(report.quota).toMatchObject({ value: '400 MB', available: true });
    expect(report.fraction).toBeCloseTo(0.1, 6);
  });

  it('says why there is no figure when the file system does not answer', () => {
    const report = buildUsageReport(sources({ adapter: null }));
    expect(report.used.available).toBe(false);
    expect(report.used.reason).toBe(REASONS.adapter);
    expect(report.fraction).toBeNull();
  });

  it('draws no bar when there is no quota, and says why', () => {
    const report = buildUsageReport(sources({ adapter: { used: 5, quota: null } }));
    expect(report.quota.available).toBe(false);
    expect(report.quota.reason).toBe(REASONS.quota);
    expect(report.fraction).toBeNull();
  });

  it('reports the browser estimate beside the file system figure', () => {
    const report = buildUsageReport(sources());
    expect(report.browser).toMatchObject({ value: '40.0 MB of 400 MB', available: true });
  });

  it('says nothing about the browser when it cannot estimate', () => {
    const report = buildUsageReport(
      sources({ browser: null, browserReason: REASONS.estimateMissing }),
    );
    expect(report.browser.available).toBe(false);
    expect(report.browser.reason).toBe(REASONS.estimateMissing);
  });

  it('will not pass a browser estimate off as a figure for another backing store', () => {
    const report = buildUsageReport(
      sources({ adapterId: 'memory', browser: { usage: 900 * MB, quota: null } }),
    );
    expect(report.browser.available).toBe(false);
    expect(report.browser.reason).toContain('held in memory');
    expect(report.used.value).toBe('40.0 MB');
  });

  it('reports a disagreement instead of picking a side', () => {
    const report = buildUsageReport(sources({ browser: { usage: 58 * MB, quota: 400 * MB } }));
    expect(report.disagreement).toContain('58.0 MB');
    expect(report.disagreement).toContain('40.0 MB');
    expect(report.used.value).toBe('40.0 MB');
  });

  it('stays quiet when the two agree to within measurement noise', () => {
    const report = buildUsageReport(
      sources({ browser: { usage: 40 * MB + 4096, quota: 400 * MB } }),
    );
    expect(report.disagreement).toBeNull();
  });

  it('names the source of the figures', () => {
    expect(buildUsageReport(sources({ adapterId: 'opfs' })).source).toContain('opfs');
  });
});

describe('browserBacked', () => {
  it('knows which adapters the browser estimate describes', () => {
    expect(browserBacked('opfs').backed).toBe(true);
    expect(browserBacked('indexeddb').backed).toBe(true);
    expect(browserBacked('memory').backed).toBe(false);
    expect(browserBacked('tauri').backed).toBe(false);
  });

  it('does not claim to know about an adapter it has never met', () => {
    const unknownAdapter = browserBacked('sqlite');
    expect(unknownAdapter.backed).toBe(false);
    expect(unknownAdapter.reason).toContain('sqlite');
  });
});

describe('buildSegments', () => {
  const totals = categoryTotals([
    { path: '/a/film.mp4', size: 900 },
    { path: '/a/photo.png', size: 300 },
    { path: '/a/notes.md', size: 100 },
  ]);

  it('orders categories largest first and drops empty ones', () => {
    const segments = buildSegments(totals, { bytes: 50, files: 1 });
    expect(segments.map((s) => s.label)).toEqual(['Video', 'Pictures', 'Documents', 'Trash']);
  });

  it('always keeps the Trash as its own segment, even when empty', () => {
    const segments = buildSegments(totals, { bytes: 0, files: 0 });
    expect(segments[segments.length - 1]).toMatchObject({ id: 'trash', bytes: 0, share: 0 });
  });

  it('gives the accent to the largest segment and neutrals to the rest', () => {
    const segments = buildSegments(totals, { bytes: 50, files: 1 });
    expect(segments.filter((s) => s.accent)).toHaveLength(1);
    expect(segments[0]).toMatchObject({ label: 'Video', color: 'var(--lumen-accent)' });
    for (const segment of segments.slice(1)) expect(segment.color).toContain('color-mix');
  });

  it('gives the accent to the Trash when the Trash is the largest', () => {
    const segments = buildSegments(totals, { bytes: 5000, files: 2 });
    expect(segments.find((s) => s.accent)?.id).toBe('trash');
  });

  it('makes shares add up to one', () => {
    const segments = buildSegments(totals, { bytes: 50, files: 1 });
    const sum = segments.reduce((total, s) => total + s.share, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('has no shares to compute when nothing is stored', () => {
    const segments = buildSegments(categoryTotals([]), { bytes: 0, files: 0 });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ id: 'trash', share: 0, accent: false });
  });

  it('leaves the Trash out entirely when its size could not be measured', () => {
    expect(buildSegments(totals, null).map((s) => s.id)).toEqual([
      'video',
      'pictures',
      'documents',
    ]);
  });
});

describe('segmentColor', () => {
  it('steps down a single neutral ramp', () => {
    expect(segmentColor(0, 4)).toContain('62%');
    expect(segmentColor(3, 4)).toContain('14%');
  });

  it('handles a ramp with one step', () => {
    expect(segmentColor(0, 1)).toContain('62%');
  });
});

describe('formatShare', () => {
  it('rounds big shares to whole percent and small ones to a digit', () => {
    expect(formatShare(0.5)).toBe('50%');
    expect(formatShare(0.043)).toBe('4.3%');
  });

  it('never rounds a real share down to zero', () => {
    expect(formatShare(0.0004)).toBe('<0.1%');
    expect(formatShare(0)).toBe('0%');
  });
});

describe('coverageNote', () => {
  it('states what the segments do not cover', () => {
    const note = coverageNote(10 * MB, { used: 12 * MB, quota: null }, '/Users/ada');
    expect(note).toContain('2.0 MB');
    expect(note).toContain('/Users/ada');
  });

  it('states the gap the other way round too', () => {
    expect(coverageNote(12 * MB, { used: 10 * MB, quota: null }, '/Users/ada')).toContain(
      'cover 2.0 MB more',
    );
  });

  it('says nothing when the two are within a kilobyte', () => {
    expect(coverageNote(1000, { used: 1200, quota: null }, '/Users/ada')).toBeNull();
    expect(coverageNote(1000, null, '/Users/ada')).toBeNull();
  });
});

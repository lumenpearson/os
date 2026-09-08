import type { SystemInfo } from '@lumen/platform';
import { describe, expect, it } from 'vitest';
import { known, REASONS, unknown } from './probe';
import {
  buildSections,
  countUnavailable,
  type FactRow,
  formatDuration,
  type LiveValues,
  type Section,
  type Snapshot,
} from './sections';

const BOOTED_AT = Date.UTC(2026, 8, 4, 9, 0, 0);
const COLLECTED_AT = BOOTED_AT + 60_000;
const NOW = BOOTED_AT + 3_723_000; // 1 h 02 m 03 s later

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * What the web platform bridge returns: real version strings, and
 * substitutes for everything a browser cannot see. The sheet must print the
 * first and refuse the second.
 */
const WEB_INFO: SystemInfo = {
  host: 'web',
  hostname: 'localhost',
  os: { name: 'Windows', version: '10/11', arch: 'x64' },
  kernel: 'lumen 0.1.0 (web)',
  appVersion: '0.4.2',
  cpu: { model: '8-core x64', cores: 8 },
  memory: { total: 8 * 1024 ** 3, available: 4.8 * 1024 ** 3 },
  uptime: 60,
  display: { width: 1920, height: 1080, scale: 1 },
  userAgent: CHROME_UA,
};

const HOST_INFO: SystemInfo = {
  host: 'tauri',
  hostname: 'studio-01',
  os: { name: 'Windows', version: '11', arch: 'x86_64' },
  kernel: 'lumen 0.1.0 (tauri)',
  appVersion: '0.4.2',
  cpu: { model: 'AMD Ryzen 7 7840U', cores: 16 },
  memory: { total: 32 * 1024 ** 3, available: 20 * 1024 ** 3 },
  uptime: 7200,
  display: { width: 2880, height: 1800, scale: 2 },
  userAgent: CHROME_UA,
};

const LIVE: LiveValues = { now: NOW, startedAtLabel: '4 Sept 2026 09:00' };

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    collectedAt: COLLECTED_AT,
    kind: 'web',
    info: WEB_INFO,
    adapterId: 'opfs',
    hints: null,
    gpu: {
      renderer: known('ANGLE (Intel Arc)'),
      vendor: known('Google Inc.'),
      api: known('WebGL 2.0'),
    },
    refresh: { hz: 120, frames: 74, spanMs: 608 },
    storage: { source: 'storage-api', used: 24 * 1024 ** 2, quota: 2 * 1024 ** 3 },
    vfsBytes: 3 * 1024 ** 2,
    features: [
      { id: 'opfs', label: 'Origin private file system', supported: true },
      { id: 'webgl', label: 'WebGL', supported: false },
    ],
    bootedAt: BOOTED_AT,
    previousUptimeMs: 3_600_000,
    env: {
      navigator: { userAgent: CHROME_UA, hardwareConcurrency: 8, languages: ['en-GB'] },
      screen: { width: 1920, height: 1080, colorDepth: 24 },
      devicePixelRatio: 1.5,
      matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: dark)' }),
      dateTimeFormat: {
        locale: 'en-GB',
        timeZone: 'Europe/London',
      } as Intl.ResolvedDateTimeFormatOptions,
      timeZoneOffsetMinutes: -60,
    },
    ...overrides,
  };
}

function find(sections: Section[], id: string): FactRow {
  const row = sections.flatMap((s) => s.rows).find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

describe('formatDuration', () => {
  it('is a fixed-width clock under a day', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(3723)).toBe('01:02:03');
    expect(formatDuration(86_399)).toBe('23:59:59');
  });

  it('adds whole days above one', () => {
    expect(formatDuration(90_061)).toBe('1 d 01:01:01');
  });

  it('never goes negative', () => {
    expect(formatDuration(-5)).toBe('00:00:00');
  });
});

describe('buildSections', () => {
  it('lists the seven sections plus the feature matrix, in order', () => {
    expect(buildSections(snapshot(), LIVE).map((s) => s.id)).toEqual([
      'overview',
      'processor',
      'memory',
      'graphics',
      'storage',
      'software',
      'features',
      'uptime',
    ]);
  });

  it('gives every row a unique id and a label', () => {
    const rows = buildSections(snapshot(), LIVE).flatMap((s) => s.rows);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.label.length > 0)).toBe(true);
  });

  it('never leaves an unavailable row without a reason, or with a value', () => {
    for (const kind of ['web', 'tauri'] as const) {
      const rows = buildSections(
        snapshot({ kind, info: kind === 'tauri' ? HOST_INFO : WEB_INFO }),
        LIVE,
      ).flatMap((s) => s.rows);
      for (const { fact } of rows.filter((r) => !r.fact.available)) {
        expect(fact.reason).toBeTruthy();
        expect(fact.value).toBe('');
      }
    }
  });

  it('never puts a note on a row it could not fill in', () => {
    const rows = buildSections(snapshot(), LIVE).flatMap((s) => s.rows);
    expect(rows.filter((r) => !r.fact.available && r.note)).toEqual([]);
  });
});

describe('the web build', () => {
  const sections = buildSections(snapshot(), LIVE);

  it('prints the version and kernel the build really carries', () => {
    expect(find(sections, 'overview.version').fact.value).toBe('0.4.2');
    expect(find(sections, 'overview.kernel').fact.value).toBe('lumen 0.1.0 (web)');
    expect(find(sections, 'overview.build').fact.value).toBe('Web browser');
  });

  it('refuses the web bridge substitutes for host-only readings', () => {
    expect(find(sections, 'processor.model').fact).toEqual(unknown(REASONS.cpuModel));
    expect(find(sections, 'memory.total').fact).toEqual(unknown(REASONS.installedMemory));
    expect(find(sections, 'memory.used').fact).toEqual(unknown(REASONS.installedMemory));
    expect(find(sections, 'overview.device').fact).toEqual(unknown(REASONS.hostname));
    expect(find(sections, 'uptime.host').fact).toEqual(unknown(REASONS.hostUptime));
  });

  it('does not read the architecture out of the user-agent guess', () => {
    expect(find(sections, 'processor.architecture').fact).toEqual(unknown(REASONS.architecture));
  });

  it('reads the core count from the browser instead', () => {
    const cores = find(sections, 'processor.cores');
    expect(cores.fact.value).toBe('8');
    expect(cores.note).toMatch(/hardwareConcurrency/);
  });

  it('leaves the Tauri and Rust rows out entirely', () => {
    const ids = sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).not.toContain('software.tauri');
    expect(ids).not.toContain('software.rust');
  });

  it('labels the measured refresh rate with how it was measured', () => {
    const refresh = find(sections, 'graphics.refresh');
    expect(refresh.fact.value).toBe('120 Hz');
    expect(refresh.note).toBe('Measured over 74 frames in 608 ms.');
  });

  it('passes the refresh sampler’s own reason through when it could not measure', () => {
    const rows = buildSections(
      snapshot({ refresh: { hz: null, frames: 2, spanMs: 30, reason: 'Window was hidden.' } }),
      LIVE,
    );
    expect(find(rows, 'graphics.refresh').fact).toEqual(unknown('Window was hidden.'));
  });

  it('says the origin estimate covers more than Lumen OS', () => {
    expect(find(sections, 'storage.used').fact.value).toBe('24.0 MB');
    expect(find(sections, 'storage.used').note).toMatch(/not only Lumen OS/);
    expect(find(sections, 'storage.files').fact.value).toBe('3.0 MB');
    expect(find(sections, 'storage.quota').fact.value).toBe('2.0 GB');
    expect(find(sections, 'storage.backend').fact.value).toBe('Origin private file system');
  });

  it('reports storage as unavailable when neither source answered', () => {
    const rows = buildSections(snapshot({ storage: null, vfsBytes: null }), LIVE);
    expect(find(rows, 'storage.used').fact).toEqual(unknown(REASONS.storage));
    expect(find(rows, 'storage.quota').fact).toEqual(unknown(REASONS.quota));
    expect(find(rows, 'storage.files').fact.available).toBe(false);
  });

  it('names an adapter it has no label for', () => {
    const rows = buildSections(snapshot({ adapterId: 'future-fs' }), LIVE);
    expect(find(rows, 'storage.backend').fact.value).toBe('future-fs');
  });

  it('ticks the session uptime and adds earlier sessions to the total', () => {
    expect(find(sections, 'uptime.session').fact.value).toBe('01:02:03');
    expect(find(sections, 'uptime.total').fact.value).toBe('02:02:03');
    expect(find(sections, 'uptime.started').fact.value).toBe('4 Sept 2026 09:00');
  });

  it('has no total when the kernel has not written its state file', () => {
    const rows = buildSections(snapshot({ previousUptimeMs: null }), LIVE);
    expect(find(rows, 'uptime.total').fact).toEqual(unknown(REASONS.stateFile));
  });

  it('turns the feature probes into plain supported / not supported rows', () => {
    const features = buildSections(snapshot(), LIVE).find((s) => s.id === 'features');
    expect(features?.rows.map((r) => [r.label, r.fact.value])).toEqual([
      ['Origin private file system', 'Supported'],
      ['WebGL', 'Not supported'],
    ]);
  });
});

describe('the desktop build', () => {
  const sections = buildSections(snapshot({ kind: 'tauri', info: HOST_INFO }), LIVE);

  it('reads the host readings sysinfo provides', () => {
    expect(find(sections, 'overview.build').fact.value).toBe('Desktop (Tauri)');
    expect(find(sections, 'overview.host').fact.value).toBe('Windows 11');
    expect(find(sections, 'overview.device').fact.value).toBe('studio-01');
    expect(find(sections, 'processor.model').fact.value).toBe('AMD Ryzen 7 7840U');
    expect(find(sections, 'processor.cores').fact.value).toBe('16');
    expect(find(sections, 'processor.architecture').fact.value).toBe('x86_64');
    expect(find(sections, 'memory.total').fact.value).toBe('32.0 GB');
    expect(find(sections, 'memory.used').fact.value).toBe('12.0 GB');
  });

  it('extrapolates host uptime from the moment the reading was taken', () => {
    // 2 h when the reading was taken, plus the 1 h 01 m 03 s since.
    expect(find(sections, 'uptime.host').fact.value).toBe('03:01:03');
  });

  it('admits the bridge reports neither the Tauri nor the Rust version', () => {
    expect(find(sections, 'software.tauri').fact).toEqual(unknown(REASONS.tauriVersion));
    expect(find(sections, 'software.rust').fact).toEqual(unknown(REASONS.rustVersion));
  });
});

describe('a bridge that did not answer', () => {
  const sections = buildSections(snapshot({ info: null }), LIVE);

  it('marks the version and kernel unavailable rather than inventing them', () => {
    expect(find(sections, 'overview.version').fact).toEqual(unknown(REASONS.platformBridge));
    expect(find(sections, 'overview.kernel').fact).toEqual(unknown(REASONS.platformBridge));
  });

  it('still counts every row', () => {
    expect(countUnavailable(sections)).toBeGreaterThan(0);
    expect(countUnavailable([{ id: 'x', title: 'X', rows: [] }])).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  type CommitResult,
  type InstallerDeps,
  type InstallJob,
  jobSignature,
  progressLabel,
  progressRatio,
  rowStatus,
  runInstall,
} from './installer';
import type {
  BundlePackage,
  PackageDocument,
  PackageSummary,
  PayloadPackage,
  StoreResult,
  VerifiedPayload,
} from './remote';
import { bundlePackage, payloadPackage, summary } from './remote/fixture';

const UNITS = 'com.lumen.units';

function manifestPayload(id: string, version: string) {
  return { kind: 'app' as const, manifest: { id, name: id, version, html: '<p>x</p>' } };
}

function verified(pkg: PayloadPackage): VerifiedPayload {
  return {
    id: pkg.id,
    version: pkg.version,
    size: pkg.size,
    sha256: pkg.sha256,
    document: manifestPayload(pkg.id, pkg.version),
  };
}

interface Harness {
  deps: InstallerDeps;
  commits: string[];
  jobs: InstallJob[];
}

function harness(
  documents: readonly PackageDocument[],
  overrides: Partial<InstallerDeps> = {},
  catalogue?: readonly PackageSummary[],
): Harness {
  const commits: string[] = [];
  const jobs: InstallJob[] = [];
  const byId = new Map(documents.map((d) => [d.id, d]));
  const deps: InstallerDeps = {
    catalogue: catalogue ?? documents.map((d) => summary({ id: d.id, name: d.name, kind: d.kind })),
    builtInIds: [],
    readPackage: async (id) => {
      const document = byId.get(id);
      return document
        ? { ok: true, value: document }
        : {
            ok: false,
            error: {
              reason: 'http',
              url: id,
              status: 404,
              statusText: '',
              message: 'The store has no such file (404).',
            },
          };
    },
    download: async (pkg, onProgress) => {
      onProgress({ loaded: 0, total: pkg.size });
      onProgress({ loaded: pkg.size, total: pkg.size });
      return { ok: true, value: verified(pkg) };
    },
    commit: async (plan) => {
      commits.push(plan.id);
      return { ok: true, message: `Wrote /Applications/${plan.name}.app` };
    },
    emit: (job) => jobs.push(job),
    ...overrides,
  };
  return { deps, commits, jobs };
}

function phases(job: InstallJob): string[] {
  return job.rows.map((r) => r.phase);
}

describe('installing one package', () => {
  it('reads, downloads, verifies, installs, and says so in that order', async () => {
    const pkg = payloadPackage();
    const { deps, commits, jobs } = harness([pkg]);
    const job = await runInstall(pkg, deps);

    expect(job.state).toBe('done');
    expect(commits).toEqual([pkg.id]);
    expect(phases(job)).toEqual(['installed']);
    expect(job.rows[0]?.message).toContain('/Applications/');
    const seen = jobs.flatMap((j) => j.rows.map((r) => r.phase));
    expect(seen).toContain('downloading');
    expect(seen).toContain('verifying');
    expect(seen).toContain('installing');
    expect(seen.indexOf('downloading')).toBeLessThan(seen.indexOf('verifying'));
    expect(seen.indexOf('verifying')).toBeLessThan(seen.indexOf('installing'));
  });

  it('reports the bytes as they arrive', async () => {
    const pkg = payloadPackage({ size: 1000 });
    const { deps, jobs } = harness([pkg], {
      download: async (p, onProgress) => {
        onProgress({ loaded: 0, total: 1000 });
        onProgress({ loaded: 400, total: 1000 });
        onProgress({ loaded: 1000, total: 1000 });
        return { ok: true, value: verified(p) };
      },
    });
    await runInstall(pkg, deps);
    const loaded = jobs.map((j) => j.rows[0]?.loaded ?? 0);
    expect(loaded).toContain(400);
    expect(loaded).toContain(1000);
  });

  it('names the verification step the moment the last byte is in', async () => {
    const pkg = payloadPackage({ size: 100 });
    const { deps, jobs } = harness([pkg], {
      download: async (p, onProgress) => {
        onProgress({ loaded: 100, total: 100 });
        return { ok: true, value: verified(p) };
      },
    });
    await runInstall(pkg, deps);
    const atFull = jobs.find((j) => j.rows[0]?.loaded === 100);
    expect(atFull?.rows[0]?.phase).toBe('verifying');
  });
});

describe('when something goes wrong', () => {
  const offline: StoreResult<VerifiedPayload> = {
    ok: false,
    error: {
      reason: 'offline',
      url: 'https://store.example/payload.json',
      cause: null,
      message: 'The store could not be reached. Check the connection and the address.',
    },
  };

  it('fails the row with the sentence the store client wrote, offline', async () => {
    const pkg = payloadPackage();
    const { deps, commits } = harness([pkg], { download: async () => offline });
    const job = await runInstall(pkg, deps);
    expect(job.state).toBe('failed');
    expect(phases(job)).toEqual(['failed']);
    expect(job.rows[0]?.message).toContain('could not be reached');
    expect(job.message).toContain('could not be reached');
    expect(commits).toEqual([]);
  });

  it('names both checksums when the bytes are not the ones described', async () => {
    const pkg = payloadPackage();
    const { deps, commits } = harness([pkg], {
      download: async () => ({
        ok: false,
        error: {
          reason: 'digest',
          url: 'u',
          expected: 'aa',
          received: 'bb',
          message:
            'The download is not the file the catalogue describes: its checksum is bb, not aa.',
        },
      }),
    });
    const job = await runInstall(pkg, deps);
    expect(job.state).toBe('failed');
    expect(job.rows[0]?.message).toContain('its checksum is bb, not aa');
    expect(commits).toEqual([]);
  });

  it('refuses a package whose id belongs to a built-in app, before downloading', async () => {
    const pkg = payloadPackage();
    const download = vi.fn();
    const { deps } = harness([pkg], {
      builtInIds: [pkg.id],
      download: download as unknown as InstallerDeps['download'],
    });
    const job = await runInstall(pkg, deps);
    expect(job.state).toBe('failed');
    expect(job.message).toContain('built into Lumen OS');
    expect(download).not.toHaveBeenCalled();
  });

  it('carries a refusal from the kernel back into the row', async () => {
    const pkg = payloadPackage();
    const refusal: CommitResult = {
      ok: false,
      message: '/Applications/Pomodoro.app already holds another program.',
    };
    const { deps } = harness([pkg], { commit: async () => refusal });
    const job = await runInstall(pkg, deps);
    expect(job.state).toBe('failed');
    expect(job.rows[0]?.message).toBe(refusal.message);
  });

  it('says the package could not be read when the catalogue lists one the store lacks', async () => {
    const bundle = bundlePackage({ members: [UNITS] });
    const { deps } = harness([bundle], {}, [
      summary({ id: bundle.id, kind: 'bundle', name: bundle.name }),
      summary({ id: UNITS, name: 'Units' }),
    ]);
    const job = await runInstall(bundle, deps);
    expect(job.state).toBe('failed');
    expect(job.rows[0]?.phase).toBe('failed');
    expect(job.rows[0]?.message).toContain('404');
  });
});

describe('installing a bundle', () => {
  const pomodoro = payloadPackage();
  const units = payloadPackage({
    id: UNITS,
    name: 'Units',
    payload: `payload/${UNITS}-1.2.0.json`,
  });
  const bundle = bundlePackage({ members: [pomodoro.id, UNITS] });
  const catalogue = [
    summary({ id: bundle.id, kind: 'bundle', name: bundle.name }),
    summary({ id: pomodoro.id, name: pomodoro.name }),
    summary({ id: UNITS, name: 'Units' }),
  ];

  it('gives each member a row and installs them in the order the bundle lists', async () => {
    const { deps, commits } = harness([bundle, pomodoro, units], {}, catalogue);
    const job = await runInstall(bundle, deps);
    expect(job.bundle).toBe(true);
    expect(job.rows.map((r) => r.id)).toEqual([pomodoro.id, UNITS]);
    expect(job.rows.map((r) => r.name)).toEqual(['Pomodoro', 'Units']);
    expect(commits).toEqual([pomodoro.id, UNITS]);
    expect(job.state).toBe('done');
    expect(job.message).toContain('2 packages');
  });

  it('stops at the first failure and leaves the rest unstarted', async () => {
    const { deps, commits } = harness(
      [bundle, pomodoro, units],
      {
        download: async (pkg, onProgress) => {
          if (pkg.id === pomodoro.id) {
            return {
              ok: false,
              error: {
                reason: 'size',
                url: 'u',
                expected: 10,
                received: 4,
                message:
                  'The download is less than the catalogue promised: 4 bytes where it said 10.',
              },
            };
          }
          onProgress({ loaded: pkg.size, total: pkg.size });
          return { ok: true, value: verified(pkg) };
        },
      },
      catalogue,
    );
    const job = await runInstall(bundle, deps);
    expect(phases(job)).toEqual(['failed', 'skipped']);
    expect(job.message).toContain('stopped at Pomodoro');
    expect(job.message).toContain('4 bytes where it said 10');
    expect(commits).toEqual([]);
  });

  it('refuses a bundle whose member the catalogue does not list, before any download', async () => {
    const missing = bundlePackage({ members: [pomodoro.id, 'com.lumen.ghost'] });
    const download = vi.fn();
    const { deps } = harness(
      [missing, pomodoro],
      {
        download: download as unknown as InstallerDeps['download'],
      },
      [
        summary({ id: missing.id, kind: 'bundle', name: missing.name }),
        summary({ id: pomodoro.id, name: pomodoro.name }),
      ],
    );
    const job = await runInstall(missing, deps);
    expect(job.state).toBe('failed');
    expect(job.message).toContain('com.lumen.ghost');
    expect(job.rows).toEqual([]);
    expect(download).not.toHaveBeenCalled();
  });

  it('reads a bundle inside a bundle so its members can be installed too', async () => {
    const inner = bundlePackage({ id: 'com.lumen.inner', name: 'Inner', members: [UNITS] });
    const outer = bundlePackage({
      id: 'com.lumen.outer',
      name: 'Outer',
      members: [pomodoro.id, inner.id],
    });
    const { deps, commits } = harness([outer, inner, pomodoro, units], {}, [
      summary({ id: outer.id, kind: 'bundle', name: 'Outer' }),
      summary({ id: inner.id, kind: 'bundle', name: 'Inner' }),
      summary({ id: pomodoro.id, name: pomodoro.name }),
      summary({ id: UNITS, name: 'Units' }),
    ]);
    const job = await runInstall(outer, deps);
    expect(job.rows.map((r) => r.id)).toEqual([pomodoro.id, UNITS]);
    expect(commits).toEqual([pomodoro.id, UNITS]);
  });

  it('refuses a bundle that contains itself', async () => {
    const cyclic: BundlePackage = bundlePackage({
      id: 'com.lumen.loop',
      name: 'Loop',
      members: ['com.lumen.loop'],
    });
    const { deps } = harness([cyclic], {}, [
      summary({ id: cyclic.id, kind: 'bundle', name: 'Loop' }),
    ]);
    const job = await runInstall(cyclic, deps);
    expect(job.state).toBe('failed');
    expect(job.message).toContain('contains itself');
  });
});

describe('what a row shows', () => {
  const base = {
    id: 'a',
    name: 'A',
    kind: 'app' as const,
    phase: 'downloading' as const,
    loaded: 512,
    total: 2048,
    message: null,
  };

  it('reports a ratio only while the length is known', () => {
    expect(progressRatio(base)).toBe(0.25);
    expect(progressRatio({ ...base, total: null })).toBeNull();
    expect(progressRatio({ ...base, phase: 'installed', total: null })).toBe(1);
    expect(progressRatio({ ...base, loaded: 4096 })).toBe(1);
  });

  it('prints what has arrived against what is expected', () => {
    expect(progressLabel(base)).toBe('512 B of 2.0 KB');
    expect(progressLabel({ ...base, phase: 'verifying' })).toBe('2.0 KB');
    expect(progressLabel({ ...base, total: null })).toBe('512 B');
  });

  it('names the phase, or the outcome once there is one', () => {
    expect(rowStatus(base)).toBe('Downloading');
    expect(rowStatus({ ...base, phase: 'verifying' })).toBe('Checking size and sha256');
    expect(rowStatus({ ...base, phase: 'failed', message: 'Nope.' })).toBe('Nope.');
    expect(rowStatus({ ...base, phase: 'installed', message: null })).toBe('Installed');
  });
});

describe('jobSignature', () => {
  const job: InstallJob = {
    id: 'a',
    name: 'A',
    bundle: false,
    rows: [
      {
        id: 'a',
        name: 'A',
        kind: 'app',
        phase: 'downloading',
        loaded: 1,
        total: 10,
        message: null,
      },
    ],
    state: 'running',
    message: null,
  };

  it('ignores byte counts, which move too often for a render', () => {
    const moved = { ...job, rows: [{ ...(job.rows[0] as InstallRowType), loaded: 9 }] };
    expect(jobSignature(moved)).toBe(jobSignature(job));
  });

  it('changes when a phase or a message changes', () => {
    const next = {
      ...job,
      rows: [{ ...(job.rows[0] as InstallRowType), phase: 'verifying' as const }],
    };
    expect(jobSignature(next)).not.toBe(jobSignature(job));
  });
});

type InstallRowType = InstallJob['rows'][number];

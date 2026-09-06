import type { Platform, PlatformKind, SystemInfo } from '@lumen/platform';
import { elevate, MemoryAdapter, Vfs } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import { collectSnapshot, readPreviousUptime, readStorage, readVfsBytes } from './collect';
import type { FrameSampler } from './refresh';

const INFO: SystemInfo = {
  host: 'tauri',
  hostname: 'studio-01',
  os: { name: 'Windows', version: '11', arch: 'x86_64' },
  kernel: 'lumen 0.1.0 (tauri)',
  appVersion: '0.4.2',
  cpu: { model: 'AMD Ryzen 7 7840U', cores: 16 },
  memory: { total: 32 * 1024 ** 3, available: 20 * 1024 ** 3 },
  uptime: 7200,
  display: { width: 2880, height: 1800, scale: 2 },
  userAgent: 'test',
};

/** Only the two members `collectSnapshot` touches are worth stubbing. */
function stubPlatform(kind: PlatformKind, info: SystemInfo | null): Platform {
  const platform: Pick<Platform, 'kind' | 'system'> = {
    kind,
    system: {
      info: async () => {
        if (!info) throw new Error('bridge unavailable');
        return info;
      },
      metrics: () => Promise.reject(new Error('unused')),
      processes: async () => [],
      killProcess: async () => false,
    },
  };
  return platform as Platform;
}

/** Frames delivered inline, so a collection finishes without a real clock. */
function instantSampler(stepMs = 8): FrameSampler {
  let timestamp = 0;
  return {
    request(callback) {
      timestamp += stepMs;
      callback(timestamp);
      return 1;
    },
    cancel() {},
    now: () => 0,
  };
}

async function makeVfs(): Promise<Vfs> {
  const vfs = new Vfs(new MemoryAdapter());
  await vfs.writeText('/Users/ada/notes.txt', 'hello', { recursive: true });
  return vfs;
}

describe('readVfsBytes', () => {
  it('sums the files in the file system', async () => {
    await expect(readVfsBytes(await makeVfs())).resolves.toBe(5);
  });
});

describe('readStorage', () => {
  it('asks the adapter on the desktop build', async () => {
    await expect(readStorage(await makeVfs(), 'tauri')).resolves.toEqual({
      source: 'adapter',
      used: 5,
      quota: null,
    });
  });

  it('reports nothing when the adapter fails', async () => {
    const vfs = new Vfs(new MemoryAdapter());
    vfs.usage = () => Promise.reject(new Error('gone'));
    await expect(readStorage(vfs, 'tauri')).resolves.toBeNull();
  });
});

describe('readPreviousUptime', () => {
  /**
   * /System is protected, so standing in for the kernel means saying so — the
   * same authority `Kernel.saveState` passes. Reading it back needs none:
   * the rule refuses changes, never reads.
   */
  const asKernel = { recursive: true, elevation: elevate('test: the kernel writing its state') };

  it('reads the total the kernel recorded', async () => {
    const vfs = await makeVfs();
    await vfs.writeJson('/System/state.json', { totalUptimeMs: 1234 }, asKernel);
    await expect(readPreviousUptime(vfs)).resolves.toBe(1234);
  });

  it('has no total when the state file is missing, broken or nonsense', async () => {
    const vfs = await makeVfs();
    await expect(readPreviousUptime(vfs)).resolves.toBeNull();
    await vfs.writeText('/System/state.json', 'not json', asKernel);
    await expect(readPreviousUptime(vfs)).resolves.toBeNull();
    await vfs.writeJson('/System/state.json', { totalUptimeMs: -1 }, asKernel);
    await expect(readPreviousUptime(vfs)).resolves.toBeNull();
  });
});

describe('collectSnapshot', () => {
  it('gathers one reading of everything', async () => {
    const vfs = await makeVfs();
    const snapshot = await collectSnapshot({
      platform: stubPlatform('tauri', INFO),
      vfs,
      bootedAt: 1000,
      sampler: instantSampler(),
      sampleMs: 100,
    });
    expect(snapshot.kind).toBe('tauri');
    expect(snapshot.info).toEqual(INFO);
    expect(snapshot.adapterId).toBe('memory');
    expect(snapshot.vfsBytes).toBe(5);
    expect(snapshot.bootedAt).toBe(1000);
    expect(snapshot.refresh.hz).toBe(125);
    expect(snapshot.features).toHaveLength(6);
    expect(snapshot.collectedAt).toBeGreaterThan(0);
  });

  it('keeps going when the platform bridge throws', async () => {
    const snapshot = await collectSnapshot({
      platform: stubPlatform('web', null),
      vfs: await makeVfs(),
      bootedAt: 1000,
      sampler: instantSampler(),
      sampleMs: 100,
    });
    expect(snapshot.info).toBeNull();
    expect(snapshot.refresh.hz).toBe(125);
  });

  it('stops sampling frames when the caller aborts', async () => {
    const controller = new AbortController();
    const sampler: FrameSampler = { request: () => 1, cancel: () => {}, now: () => 0 };
    const pending = collectSnapshot({
      platform: stubPlatform('web', INFO),
      vfs: await makeVfs(),
      bootedAt: 1000,
      sampler,
      signal: controller.signal,
    });
    controller.abort();
    const snapshot = await pending;
    expect(snapshot.refresh.hz).toBeNull();
    expect(snapshot.refresh.reason).toBeTruthy();
  });
});

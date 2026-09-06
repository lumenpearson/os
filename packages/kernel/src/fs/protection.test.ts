/**
 * The system's own files, as the assembled OS sees them.
 *
 * `packages/vfs` tests the rule; this tests the machine built on it. Before
 * the rule existed, `rm -r /System` succeeded — without a password — and took
 * the account database with it. Both halves matter and pull in opposite
 * directions: the kernel has to keep saving settings and accounts into the
 * same tree it refuses everyone else.
 */

import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import { createKernel } from '../kernel';
import { USERS_FILE } from './layout';

async function boot() {
  const platform = createWebPlatform();
  const kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  return kernel;
}

describe('the defect this was meant to fix', () => {
  it('boots with an account database on disk', async () => {
    const kernel = await boot();
    await kernel.saveSettings();
    expect(await kernel.vfs.exists(USERS_FILE)).toBe(true);
    kernel.dispose();
  });

  it('refuses rm -r /System, and the account database survives', async () => {
    const kernel = await boot();
    await expect(kernel.vfs.remove('/System', { recursive: true })).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(await kernel.vfs.exists(USERS_FILE)).toBe(true);
    kernel.dispose();
  });

  it('refuses to overwrite the account database', async () => {
    const kernel = await boot();
    await expect(kernel.vfs.writeText(USERS_FILE, '[]')).rejects.toMatchObject({ code: 'EACCES' });
    const users = await kernel.vfs.readJson<unknown[]>(USERS_FILE);
    expect(users.length).toBe(1);
    kernel.dispose();
  });

  it('still saves settings, which is what the kernel needs the write for', async () => {
    const kernel = await boot();
    await kernel.saveSettings();
    const saved = await kernel.vfs.readJson<{ appearance: { accent: string } }>(
      '/System/settings.json',
    );
    expect(saved.appearance).toBeDefined();
    kernel.dispose();
  });
});

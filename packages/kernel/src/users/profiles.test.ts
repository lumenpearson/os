/**
 * More than one person on the machine.
 *
 * The system was built for exactly one account: `hydrate` signed in whoever
 * came first in the file, two people with the same name would have shared a
 * home directory, and removing the account you were signed in as left the
 * lock screen with nobody to ask about. A second profile is what turns each
 * of those from a latent oddity into a bug someone meets.
 */

import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homeDir } from '../fs/layout';
import { createKernel, type Kernel } from '../kernel';
import { useSessionStore } from '../session/store';
import { getSettings } from '../settings/store';
import { uniqueUsername, useUsersStore } from './store';

let kernel: Kernel;

async function boot() {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  return kernel;
}

beforeEach(async () => {
  await boot();
});

afterEach(() => {
  kernel.dispose();
});

const users = () => useUsersStore.getState().users;
const currentId = () => useUsersStore.getState().currentUserId;

describe('uniqueUsername', () => {
  it('leaves a free name alone', () => {
    expect(uniqueUsername('ada', [])).toBe('ada');
  });

  it('numbers a name somebody already has', () => {
    expect(uniqueUsername('ada', ['ada'])).toBe('ada2');
    expect(uniqueUsername('ada', ['ada', 'ada2'])).toBe('ada3');
  });

  it('keeps the result within the length a username may be', () => {
    const long = 'a'.repeat(24);
    expect(uniqueUsername(long, [long]).length).toBeLessThanOrEqual(24);
  });

  it('has something to call an account with no usable name', () => {
    expect(uniqueUsername('', [])).toBe('user');
  });
});

describe('creating a profile', () => {
  it('adds an account without signing the first one out', async () => {
    const before = currentId();
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'nanosecond' });
    expect(users()).toHaveLength(2);
    expect(currentId()).toBe(before);
    expect(user.name).toBe('Grace Hopper');
  });

  it('gives the new account a home of its own, seeded', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'x' });
    const home = homeDir(user.username);
    expect(await kernel.vfs.isDirectory(home)).toBe(true);
    expect(await kernel.vfs.isDirectory(`${home}/Documents`)).toBe(true);
  });

  it('does not put two people in one home directory', async () => {
    const a = await kernel.createProfile({ name: 'Ada Lovelace', password: 'x' });
    const b = await kernel.createProfile({ name: 'Ada Lovelace', password: 'y' });
    expect(a.user.username).not.toBe(b.user.username);
    expect(homeDir(a.user.username)).not.toBe(homeDir(b.user.username));
  });

  it('hands back a recovery key once, and stores only its hash', async () => {
    const { user, recoveryKey } = await kernel.createProfile({ name: 'Grace', password: 'x' });
    expect(recoveryKey.length).toBeGreaterThan(8);
    expect(JSON.stringify(user)).not.toContain(recoveryKey);
    expect(JSON.stringify(user)).not.toContain('nanosecond');
  });
});

describe('switching', () => {
  it('locks the screen and makes the other account the one to unlock', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'nanosecond' });
    expect(await kernel.switchUser(user.id)).toBe(true);
    expect(currentId()).toBe(user.id);
    expect(useSessionStore.getState().state).toBe('locked');
  });

  it('does not sign the other account in: only their password does that', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'nanosecond' });
    await kernel.switchUser(user.id);
    expect(await kernel.unlock('wrong')).toMatchObject({ ok: false, reason: 'wrong' });
    expect(useSessionStore.getState().state).toBe('locked');
    expect(await kernel.unlock('nanosecond')).toMatchObject({ ok: true });
  });

  it('takes the home directory with it', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'x' });
    await kernel.switchUser(user.id);
    expect(getSettings().files.home).toBe(homeDir(user.username));
  });

  it('refuses to switch to the account already signed in, or to one that is not there', async () => {
    expect(await kernel.switchUser(currentId() as string)).toBe(false);
    expect(await kernel.switchUser('u_nobody')).toBe(false);
  });
});

describe('removing a profile', () => {
  it('refuses the last account', async () => {
    expect(await kernel.removeProfile(currentId() as string)).toEqual({
      ok: false,
      reason: 'last',
    });
    expect(users()).toHaveLength(1);
  });

  it('refuses the account doing the removing', async () => {
    await kernel.createProfile({ name: 'Grace Hopper', password: 'x' });
    expect(await kernel.removeProfile(currentId() as string)).toEqual({
      ok: false,
      reason: 'current',
    });
    expect(users()).toHaveLength(2);
  });

  it('removes another account and leaves their files alone', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'x' });
    expect(await kernel.removeProfile(user.id)).toEqual({ ok: true });
    expect(users()).toHaveLength(1);
    expect(await kernel.vfs.isDirectory(homeDir(user.username))).toBe(true);
  });

  it('never leaves the lock screen with nobody to ask about', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'x' });
    await kernel.switchUser(user.id);
    useUsersStore.getState().remove(user.id);
    expect(currentId()).not.toBeNull();
    expect(users().some((u) => u.id === currentId())).toBe(true);
  });
});

describe('coming back to the machine', () => {
  it('signs in as whoever was left signed in, not whoever is first in the file', async () => {
    const { user } = await kernel.createProfile({ name: 'Grace Hopper', password: 'nanosecond' });
    await kernel.switchUser(user.id);
    const stored = useUsersStore.getState().users;
    // A fresh boot over the same disk.
    useUsersStore.getState().hydrate(stored, user.id);
    expect(currentId()).toBe(user.id);
  });

  it('falls back to the first account when the remembered one is gone', () => {
    const stored = useUsersStore.getState().users;
    useUsersStore.getState().hydrate(stored, 'u_deleted');
    expect(currentId()).toBe(stored[0]?.id);
  });

  it('has nobody to sign in on an empty disk', () => {
    useUsersStore.getState().hydrate([], 'u_whoever');
    expect(currentId()).toBeNull();
  });
});

import type { AppManifest, InstalledApp } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import { checkRemoval, installPath, manifestFileName, planInstall, planUninstall } from './install';
import type { LibraryEntry } from './library';

const HOME = '/Users/ada';

function manifest(patch: Partial<AppManifest> = {}): AppManifest {
  return { id: 'user.notes', name: 'Quick Notes', html: '<b>notes</b>', ...patch };
}

function installedApp(patch: Partial<AppManifest> = {}, path?: string): InstalledApp {
  const m = manifest(patch);
  return { manifest: m, path: path ?? installPath(m.name) };
}

function entry(patch: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'user.notes',
    name: 'Quick Notes',
    description: '',
    version: null,
    category: 'user',
    keywords: [],
    source: 'installed',
    kind: 'html',
    removable: true,
    path: '/Applications/Quick Notes.app',
    definition: null,
    manifest: manifest(),
    ...patch,
  };
}

describe('manifestFileName', () => {
  it('is the name the kernel writes, with the characters a path cannot hold removed', () => {
    expect(manifestFileName('Quick Notes')).toBe('Quick Notes.app');
    expect(manifestFileName('a/b:c*?"<>|d')).toBe('abcd.app');
    expect(installPath('Quick Notes')).toBe('/Applications/Quick Notes.app');
  });
});

describe('planInstall', () => {
  const empty = { builtInIds: ['lumen.files', 'lumen.editor'], installed: [] };

  it('writes a new file and says where', () => {
    const plan = planInstall(manifest(), empty);
    expect(plan.action).toBe('install');
    expect(plan.path).toBe('/Applications/Quick Notes.app');
    expect(plan.removePaths).toEqual([]);
    expect(plan.summary).toContain('/Applications/Quick Notes.app');
  });

  it('refuses an id that belongs to a built-in app', () => {
    const plan = planInstall(manifest({ id: 'lumen.editor' }), empty);
    expect(plan.action).toBe('blocked');
    expect(plan.blockedBy).toBe('built-in');
    expect(plan.path).toBe('');
    expect(plan.summary).toContain('lumen.editor');
  });

  it('refuses a name that leaves no file name behind', () => {
    const plan = planInstall(manifest({ name: '??' }), empty);
    expect(plan.blockedBy).toBe('unusable-name');
  });

  it('refuses to overwrite a file that belongs to another app', () => {
    const other = installedApp({ id: 'user.other', name: 'Quick Notes' });
    const plan = planInstall(manifest(), { ...empty, installed: [other] });
    expect(plan.action).toBe('blocked');
    expect(plan.blockedBy).toBe('name-conflict');
    expect(plan.summary).toContain('user.other');
  });

  it('replaces the file in place when the same id keeps its name', () => {
    const previous = installedApp();
    const plan = planInstall(manifest({ version: '2.0' }), { ...empty, installed: [previous] });
    expect(plan.action).toBe('replace');
    expect(plan.path).toBe(previous.path);
    expect(plan.removePaths).toEqual([]);
    expect(plan.previous).toBe(previous);
  });

  it('removes the old file when the same id is reinstalled under a new name', () => {
    const previous = installedApp({ name: 'Notes' });
    const plan = planInstall(manifest({ name: 'Quick Notes' }), {
      ...empty,
      installed: [previous],
    });
    expect(plan.action).toBe('replace');
    expect(plan.path).toBe('/Applications/Quick Notes.app');
    expect(plan.removePaths).toEqual(['/Applications/Notes.app']);
    expect(plan.summary).toContain('Trash');
  });

  it('leaves other installed apps alone', () => {
    const other = installedApp({ id: 'user.timer', name: 'Timer' });
    const plan = planInstall(manifest(), { ...empty, installed: [other] });
    expect(plan.action).toBe('install');
    expect(plan.removePaths).toEqual([]);
  });
});

describe('checkRemoval', () => {
  it('keeps built-in apps', () => {
    const check = checkRemoval(entry({ source: 'built-in', kind: 'built-in', path: null }));
    expect(check.removable).toBe(false);
    expect(check.reason).toContain('Part of Lumen OS');
  });

  it('removes an installed manifest', () => {
    expect(checkRemoval(entry()).removable).toBe(true);
  });

  it('cannot remove what has no file', () => {
    expect(checkRemoval(entry({ path: null })).removable).toBe(false);
  });
});

describe('planUninstall', () => {
  it('names the file, and says the data under home is kept', () => {
    const plan = planUninstall(entry(), HOME);
    expect(plan?.filePath).toBe('/Applications/Quick Notes.app');
    expect(plan?.dataPath).toBe('/Users/ada/.appdata/user.notes.json');
    expect(plan?.keepsData).toBe(true);
    expect(plan?.title).toBe('Remove Quick Notes?');
    expect(plan?.message).toContain('moves to the Trash');
    expect(plan?.message).toContain('/Users/ada/.appdata/user.notes.json');
    expect(plan?.message).toContain('does not delete it');
  });

  it('says a script keeps nothing of its own', () => {
    const plan = planUninstall(entry({ kind: 'script' }), HOME);
    expect(plan?.dataPath).toBeNull();
    expect(plan?.message).toContain('keeps no data of its own');
  });

  it('reassures that an alias leaves its target alone', () => {
    expect(planUninstall(entry({ kind: 'alias' }), HOME)?.message).toContain('not touched');
  });

  it('has no plan for a built-in', () => {
    expect(planUninstall(entry({ source: 'built-in', path: null }), HOME)).toBeNull();
  });
});

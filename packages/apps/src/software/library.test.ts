import type { AppDefinition, AppManifest, InstalledApp } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import {
  buildLibrary,
  categoryOptions,
  countBySource,
  entryMatches,
  filterEntries,
  findEntry,
  manifestKind,
} from './library';

function definition(patch: Partial<AppDefinition> = {}): AppDefinition {
  return {
    id: 'lumen.editor',
    name: 'Text Editor',
    description: 'Plain-text editing.',
    category: 'utilities',
    icon: () => null,
    component: () => null,
    window: { width: 700, height: 500 },
    keywords: ['notepad'],
    ...patch,
  };
}

function installed(patch: Partial<AppManifest> = {}): InstalledApp {
  const manifest: AppManifest = {
    id: 'user.timer',
    name: 'Timer',
    description: 'Counts down.',
    version: '1.0',
    html: '<b>timer</b>',
    ...patch,
  };
  return { manifest, path: `/Applications/${manifest.name}.app` };
}

describe('manifestKind', () => {
  it('reads the entry point the kernel would run', () => {
    expect(manifestKind({ id: 'a.b', name: 'A', alias: { appId: 'lumen.files' } })).toBe('alias');
    expect(manifestKind({ id: 'a.b', name: 'A', script: 'ls' })).toBe('script');
    expect(manifestKind({ id: 'a.b', name: 'A', html: '<b>x</b>' })).toBe('html');
  });

  it('follows the kernel order when several are present', () => {
    expect(manifestKind({ id: 'a.b', name: 'A', alias: { appId: 'x' }, html: 'y' })).toBe('alias');
  });
});

describe('buildLibrary', () => {
  it('puts built-ins and installed manifests in one list, by name', () => {
    const list = buildLibrary([definition()], [installed()]);
    expect(list.map((e) => e.name)).toEqual(['Text Editor', 'Timer']);
    expect(list.map((e) => e.source)).toEqual(['built-in', 'installed']);
  });

  it('marks built-ins as part of the system and manifests as removable', () => {
    const list = buildLibrary([definition()], [installed()]);
    expect(list[0]?.removable).toBe(false);
    expect(list[0]?.path).toBeNull();
    expect(list[1]?.removable).toBe(true);
    expect(list[1]?.path).toBe('/Applications/Timer.app');
  });

  it('carries the manifest fields the details pane prints', () => {
    const entry = buildLibrary([], [installed({ category: 'office', keywords: ['clock'] })])[0];
    expect(entry?.version).toBe('1.0');
    expect(entry?.category).toBe('office');
    expect(entry?.keywords).toEqual(['clock']);
    expect(entry?.kind).toBe('html');
  });

  it('files a manifest without a category under user', () => {
    expect(buildLibrary([], [installed()])[0]?.category).toBe('user');
  });

  it('lets the built-in win when a manifest claims a registered id, as the kernel does', () => {
    const list = buildLibrary([definition()], [installed({ id: 'lumen.editor', name: 'Faker' })]);
    expect(list).toHaveLength(1);
    expect(list[0]?.source).toBe('built-in');
    expect(list[0]?.name).toBe('Text Editor');
  });
});

describe('searching and filtering', () => {
  const entries = buildLibrary(
    [definition(), definition({ id: 'lumen.files', name: 'Files', category: 'system' })],
    [installed()],
  );

  it('matches name, id, description and keywords', () => {
    const editor = entries.find((e) => e.id === 'lumen.editor');
    if (!editor) throw new Error('missing entry');
    expect(entryMatches(editor, 'text')).toBe(true);
    expect(entryMatches(editor, 'lumen.ed')).toBe(true);
    expect(entryMatches(editor, 'plain-text')).toBe(true);
    expect(entryMatches(editor, 'notepad')).toBe(true);
    expect(entryMatches(editor, 'spreadsheet')).toBe(false);
  });

  it('ignores case and surrounding space, and an empty query matches all', () => {
    const editor = entries[1];
    if (!editor) throw new Error('missing entry');
    expect(entryMatches(editor, '  TEXT ')).toBe(true);
    expect(entryMatches(editor, '   ')).toBe(true);
  });

  it('filters by query and category together', () => {
    expect(filterEntries(entries, { query: 'timer' }).map((e) => e.id)).toEqual(['user.timer']);
    expect(filterEntries(entries, { category: 'system' }).map((e) => e.id)).toEqual([
      'lumen.files',
    ]);
    expect(filterEntries(entries, { category: 'system', query: 'timer' })).toEqual([]);
    expect(filterEntries(entries, {})).toHaveLength(3);
  });

  it('finds an entry by id, and nothing for a null selection', () => {
    expect(findEntry(entries, 'user.timer')?.name).toBe('Timer');
    expect(findEntry(entries, null)).toBeUndefined();
    expect(findEntry(entries, 'user.gone')).toBeUndefined();
  });
});

describe('categoryOptions', () => {
  const entries = buildLibrary(
    [definition(), definition({ id: 'lumen.files', name: 'Files', category: 'system' })],
    [installed()],
  );

  it('leads with every app and counts each category present', () => {
    expect(categoryOptions(entries)).toEqual([
      { value: 'all', label: 'All apps (3)', count: 3 },
      { value: 'system', label: 'System (1)', count: 1 },
      { value: 'utilities', label: 'Utilities (1)', count: 1 },
      { value: 'user', label: 'User (1)', count: 1 },
    ]);
  });

  it('omits categories nothing is in', () => {
    expect(categoryOptions(entries).map((o) => o.value)).not.toContain('games');
  });
});

describe('countBySource', () => {
  it('counts what came with the OS against what was installed', () => {
    const entries = buildLibrary(
      [definition()],
      [installed(), installed({ id: 'user.b', name: 'B' })],
    );
    expect(countBySource(entries)).toEqual({ 'built-in': 1, installed: 2 });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../settings/store';
import type { AppDefinition } from '../types';
import { appsForFile, appsThatCanOpen, defaultAppForFile, useRegistryStore } from './registry';

/** Four apps: two that claim `.lsd`, one that opens other things, one that opens nothing. */
function app(
  id: string,
  name: string,
  associations?: AppDefinition['fileAssociations'],
): AppDefinition {
  return {
    id,
    name,
    icon: (() => null) as unknown as AppDefinition['icon'],
    component: (() => null) as unknown as AppDefinition['component'],
    category: 'utilities',
    window: { width: 400, height: 300 },
    ...(associations ? { fileAssociations: associations } : {}),
  } as AppDefinition;
}

const SHEETS = app('lumen.sheets', 'Sheets', [
  { extensions: ['.lsd'], role: 'editor', priority: 3 },
]);
const VIEWER = app('lumen.preview', 'Preview', [
  { extensions: ['.lsd'], role: 'viewer', priority: 1 },
]);
const EDITOR = app('lumen.editor', 'Text Editor', [
  { extensions: ['.txt'], role: 'editor', priority: 2 },
]);
const CHESS = app('lumen.chess', 'Chess');

beforeEach(() => {
  useRegistryStore.setState({
    apps: Object.fromEntries([SHEETS, VIEWER, EDITOR, CHESS].map((a) => [a.id, a])),
  });
  useSettingsStore.getState().patch('files', { defaultApps: {} });
});

describe('appsForFile', () => {
  it('ranks the apps that claim the type, best first', () => {
    expect(appsForFile('/home/Budget.lsd').map((a) => a.id)).toEqual([
      'lumen.sheets',
      'lumen.preview',
    ]);
  });
});

describe('appsThatCanOpen', () => {
  it('separates the apps that claim the type from the rest that open files', () => {
    const { handlers, others } = appsThatCanOpen('/home/Budget.lsd');
    expect(handlers.map((a) => a.id)).toEqual(['lumen.sheets', 'lumen.preview']);
    expect(others.map((a) => a.id)).toEqual(['lumen.editor']);
  });

  it('leaves out an app that opens nothing at all', () => {
    const { handlers, others } = appsThatCanOpen('/home/Budget.lsd');
    expect([...handlers, ...others].map((a) => a.id)).not.toContain('lumen.chess');
  });

  it('still offers the file openers for a kind nothing claims', () => {
    const { handlers, others } = appsThatCanOpen('/home/notes.unknown');
    expect(handlers).toEqual([]);
    // By name, because there is no ranking to go on once nothing claims the kind.
    expect(others.map((a) => a.name)).toEqual(['Preview', 'Sheets', 'Text Editor']);
  });
});

describe('defaultAppForFile', () => {
  it('is the best-ranked handler when nobody has chosen', () => {
    expect(defaultAppForFile('/home/Budget.lsd')?.id).toBe('lumen.sheets');
  });

  it('is the app the person chose for that kind', () => {
    useSettingsStore.getState().patch('files', { defaultApps: { '.lsd': 'lumen.editor' } });
    expect(defaultAppForFile('/home/Budget.lsd')?.id).toBe('lumen.editor');
  });

  it('reads the extension without regard to case', () => {
    useSettingsStore.getState().patch('files', { defaultApps: { '.lsd': 'lumen.editor' } });
    expect(defaultAppForFile('/home/BUDGET.LSD')?.id).toBe('lumen.editor');
  });

  it('falls back to the ranking when the chosen app is no longer installed', () => {
    useSettingsStore.getState().patch('files', { defaultApps: { '.lsd': 'lumen.gone' } });
    expect(defaultAppForFile('/home/Budget.lsd')?.id).toBe('lumen.sheets');
  });

  it('leaves other kinds alone', () => {
    useSettingsStore.getState().patch('files', { defaultApps: { '.lsd': 'lumen.editor' } });
    expect(defaultAppForFile('/home/readme.txt')?.id).toBe('lumen.editor');
    expect(defaultAppForFile('/home/nothing.zzz')).toBeUndefined();
  });
});

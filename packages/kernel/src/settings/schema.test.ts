import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings } from './schema';
import { getSettings, useSettingsStore } from './store';

describe('settings', () => {
  it('merges partial stored settings over defaults and ignores unknown keys', () => {
    const merged = mergeSettings({
      appearance: { theme: 'dark', bogus: 1 },
      notAThing: true,
      lock: { autoLockMinutes: 'oops' },
    });
    expect(merged.appearance.theme).toBe('dark');
    expect(merged.appearance.accent).toBe('blue');
    expect((merged.appearance as unknown as Record<string, unknown>).bogus).toBeUndefined();
    expect((merged as unknown as Record<string, unknown>).notAThing).toBeUndefined();
    expect(merged.lock.autoLockMinutes).toBe(defaultSettings().lock.autoLockMinutes);
  });

  it('patches sections and sets leaves by path', () => {
    const store = useSettingsStore.getState();
    store.patch('taskbar', { autoHide: true });
    expect(useSettingsStore.getState().settings.taskbar.autoHide).toBe(true);
    store.set('lock.autoLockMinutes', 3);
    expect(useSettingsStore.getState().settings.lock.autoLockMinutes).toBe(3);
    store.reset();
    expect(useSettingsStore.getState().settings.taskbar.autoHide).toBe(false);
  });
});

describe('useSettingsStore.set', () => {
  it('writes a value at a dotted path', () => {
    const store = useSettingsStore.getState();
    store.reset();
    store.set('lock.autoLockMinutes', 7);
    expect(getSettings().lock.autoLockMinutes).toBe(7);
  });

  it('refuses a path that walks onto the prototype', () => {
    const store = useSettingsStore.getState();
    store.reset();
    // "__proto__" resolves to Object.prototype on a plain object, so a loop
    // that only checks "is this an object" would assign there and pollute
    // every object in the process.
    store.set('__proto__.polluted' as never, 'yes' as never);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('refuses a path that does not name an existing setting', () => {
    const store = useSettingsStore.getState();
    store.reset();
    const before = getSettings();
    store.set('nope.missing' as never, 1 as never);
    expect(getSettings()).toEqual(before);
  });

  it('refuses to add a new leaf beside a real section', () => {
    const store = useSettingsStore.getState();
    store.reset();
    store.set('lock.invented' as never, 1 as never);
    expect(getSettings().lock).not.toHaveProperty('invented');
  });
});

describe('leaves whose default is null', () => {
  it('keeps a stored number, because typeof null is object and would reject it', () => {
    const stored = defaultSettings();
    stored.updates.lastChecked = 1712345678;
    stored.setup.completedAt = 1712345679;

    const merged = mergeSettings(JSON.parse(JSON.stringify(stored)));

    expect(merged.updates.lastChecked).toBe(1712345678);
    expect(merged.setup.completedAt).toBe(1712345679);
  });

  it('still accepts null back, which is what "not set yet" means', () => {
    const merged = mergeSettings({ updates: { lastChecked: null } });
    expect(merged.updates.lastChecked).toBeNull();
  });

  it('refuses an object where a primitive belongs', () => {
    const merged = mergeSettings({ updates: { lastChecked: { when: 1 } } });
    expect(merged.updates.lastChecked).toBeNull();
  });

  it('refuses null where a real default belongs', () => {
    const merged = mergeSettings({ updates: { automatic: null } });
    expect(merged.updates.automatic).toBe(true);
  });
});

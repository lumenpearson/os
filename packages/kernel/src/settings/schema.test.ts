import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings } from './schema';
import { useSettingsStore } from './store';

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

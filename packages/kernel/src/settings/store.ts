import { create } from 'zustand';
import { events } from '../events';
import { defaultSettings, mergeSettings, type Settings } from './schema';

type Path<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? T[K] extends unknown[]
      ? `${P}${K}`
      : `${P}${K}` | Path<T[K], `${P}${K}.`>
    : `${P}${K}`;
}[keyof T & string];

export type SettingsPath = Path<Settings>;

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  /** Replace all settings (used at boot). */
  hydrate: (stored: unknown) => void;
  /** Update a nested section: `patch('appearance', { theme: 'dark' })`. */
  patch: <K extends keyof Settings>(section: K, value: Partial<Settings[K]>) => void;
  /** Set one leaf by dotted path: `set('lock.autoLockMinutes', 5)`. */
  set: (path: SettingsPath, value: unknown) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: defaultSettings(),
  loaded: false,
  hydrate: (stored) => {
    set({ settings: mergeSettings(stored), loaded: true });
    events.emit('settings:change', { path: '*' });
  },
  patch: (section, value) => {
    set((s) => ({ settings: { ...s.settings, [section]: { ...s.settings[section], ...value } } }));
    events.emit('settings:change', { path: section });
  },
  set: (path, value) => {
    set((s) => {
      const parts = path.split('.');
      const next = structuredClone(s.settings) as unknown as Record<string, unknown>;
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i] as string;
        // Every settings path names something the schema already defines, so
        // requiring the key to be an own property is both the correct check
        // and what keeps "__proto__.x" from walking onto Object.prototype and
        // assigning there. Reaching an inherited key means the path is wrong.
        if (!Object.hasOwn(cur, key)) return s;
        const child = cur[key];
        if (typeof child !== 'object' || child === null) return s;
        cur = child as Record<string, unknown>;
      }
      const leaf = parts[parts.length - 1] as string;
      if (!Object.hasOwn(cur, leaf)) return s;
      cur[leaf] = value;
      return { settings: next as unknown as Settings };
    });
    events.emit('settings:change', { path });
  },
  reset: () => {
    set({ settings: defaultSettings() });
    events.emit('settings:change', { path: '*' });
  },
}));

export const getSettings = () => useSettingsStore.getState().settings;

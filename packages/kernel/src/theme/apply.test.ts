import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings/schema';
import { applyThemeToDocument, stopFollowingSystemTheme } from './apply';

/**
 * A controllable prefers-color-scheme query. happy-dom's stub accepts
 * listeners and never calls them, which is exactly the behaviour that would
 * hide the bug these tests are about.
 */
let listeners: Array<() => void> = [];
let dark = false;

const original = globalThis.matchMedia;

beforeEach(() => {
  listeners = [];
  dark = false;
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return query.includes('dark') && dark;
      },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        listeners = listeners.filter((l) => l !== fn);
      },
    }),
  });
});

afterEach(() => {
  stopFollowingSystemTheme();
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    configurable: true,
    value: original,
  });
});

/** Flip the OS between light and dark and let the listener run. */
function flipSystemTheme() {
  dark = !dark;
  for (const fn of [...listeners]) fn();
}

describe('following the OS theme in auto mode', () => {
  it('re-applies the settings it was last given, not the first ones', () => {
    const first = defaultSettings();
    first.appearance.theme = 'auto';
    applyThemeToDocument(first);

    const changed = defaultSettings();
    changed.appearance.theme = 'auto';
    changed.appearance.accent = 'green';
    changed.appearance.fontScale = 1.3;
    applyThemeToDocument(changed);

    const root = document.documentElement;
    const accentAfterChange = root.style.getPropertyValue('--lumen-accent-h');
    const fontAfterChange = root.style.fontSize;

    flipSystemTheme();

    expect(root.dataset.theme).toBe('dark');
    // The listener must not drag the first settings object back over the new one.
    expect(root.style.getPropertyValue('--lumen-accent-h')).toBe(accentAfterChange);
    expect(root.style.fontSize).toBe(fontAfterChange);
  });

  it('subscribes once however many times it is applied', () => {
    const settings = defaultSettings();
    settings.appearance.theme = 'auto';
    applyThemeToDocument(settings);
    applyThemeToDocument(settings);
    applyThemeToDocument(settings);
    expect(listeners).toHaveLength(1);
  });

  it('unsubscribes when the theme stops being auto', () => {
    const auto = defaultSettings();
    auto.appearance.theme = 'auto';
    applyThemeToDocument(auto);
    expect(listeners).toHaveLength(1);

    const fixed = defaultSettings();
    fixed.appearance.theme = 'light';
    applyThemeToDocument(fixed);
    expect(listeners).toHaveLength(0);
  });
});

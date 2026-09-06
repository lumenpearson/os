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

describe('animation and blur', () => {
  it('writes each animation category as its own attribute', () => {
    const settings = defaultSettings();
    settings.animation.menus = false;
    settings.animation.minimize = 'fade';
    applyThemeToDocument(settings);
    const root = document.documentElement;
    expect(root.dataset.animMenus).toBe('off');
    expect(root.dataset.animWindows).toBe('on');
    expect(root.dataset.animMinimize).toBe('fade');
  });

  it('leaves the durations to the stylesheet at normal speed', () => {
    const settings = defaultSettings();
    applyThemeToDocument(settings);
    expect(document.documentElement.style.getPropertyValue('--duration-base')).toBe('');
  });

  it('scales every duration together, and zero stops them', () => {
    const settings = defaultSettings();
    settings.animation.speed = 0.5;
    applyThemeToDocument(settings);
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--duration-base')).toBe('90ms');
    expect(style.getPropertyValue('--duration-window')).toBe('110ms');

    settings.animation.speed = 0;
    applyThemeToDocument(settings);
    expect(style.getPropertyValue('--duration-fast')).toBe('0ms');
  });

  it('hands the durations back when reduced motion takes over', () => {
    const settings = defaultSettings();
    settings.animation.speed = 0.5;
    applyThemeToDocument(settings);
    expect(document.documentElement.style.getPropertyValue('--duration-base')).toBe('90ms');
    settings.appearance.reduceMotion = true;
    applyThemeToDocument(settings);
    // The stylesheet zeroes them under data-motion="reduced"; an inline value
    // would win over that and has to be removed.
    expect(document.documentElement.style.getPropertyValue('--duration-base')).toBe('');
    expect(document.documentElement.dataset.motion).toBe('reduced');
  });

  it('is opaque unless there is blur to see through', () => {
    const settings = defaultSettings();
    settings.appearance.blur = 0;
    applyThemeToDocument(settings);
    expect(document.documentElement.dataset.transparency).toBe('reduced');

    settings.appearance.blur = 18;
    applyThemeToDocument(settings);
    expect(document.documentElement.dataset.transparency).toBe('full');
    expect(document.documentElement.style.getPropertyValue('--lumen-blur')).toBe('18px');

    settings.appearance.reduceTransparency = true;
    applyThemeToDocument(settings);
    expect(document.documentElement.dataset.transparency).toBe('reduced');
  });
});

describe('low power mode', () => {
  const root = () => document.documentElement;

  it('switches motion, transparency and shadows off whatever the settings say', () => {
    const s = defaultSettings();
    s.appearance.reduceMotion = false;
    s.appearance.reduceTransparency = false;
    s.appearance.blur = 14;
    s.display.shadows = true;
    s.power.lowPowerMode = true;
    applyThemeToDocument(s);
    expect(root().dataset.motion).toBe('reduced');
    expect(root().dataset.transparency).toBe('reduced');
    expect(root().dataset.shadows).toBe('off');
  });

  it('gives all three back when it is switched off', () => {
    const s = defaultSettings();
    s.appearance.reduceMotion = false;
    s.appearance.reduceTransparency = false;
    s.appearance.blur = 14;
    s.display.shadows = true;
    s.power.lowPowerMode = true;
    applyThemeToDocument(s);
    s.power.lowPowerMode = false;
    applyThemeToDocument(s);
    expect(root().dataset.motion).toBe('full');
    expect(root().dataset.transparency).toBe('full');
    expect(root().dataset.shadows).toBe('on');
  });

  it('survives an OS theme flip: the replay applies it too', () => {
    const s = defaultSettings();
    s.appearance.theme = 'auto';
    s.display.shadows = true;
    s.power.lowPowerMode = true;
    applyThemeToDocument(s);
    flipSystemTheme();
    expect(root().dataset.shadows).toBe('off');
    expect(root().dataset.motion).toBe('reduced');
  });
});

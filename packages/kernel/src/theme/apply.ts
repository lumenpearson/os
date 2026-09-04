import { accents } from '@lumen/tokens';
import { events } from '../events';
import type { Settings } from '../settings/schema';

let mediaQuery: MediaQueryList | null = null;
let mediaListener: (() => void) | null = null;
let lastTheme: 'light' | 'dark' | null = null;

export function resolveTheme(mode: Settings['appearance']['theme']): 'light' | 'dark' {
  if (mode !== 'auto') return mode;
  if (typeof matchMedia !== 'function') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Write the current settings into the DOM: theme, accent, scale, motion, contrast, cursor. */
export function applyThemeToDocument(settings: Settings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = resolveTheme(settings.appearance.theme);
  root.dataset.theme = theme;
  root.dataset.contrast = settings.appearance.contrast;
  root.dataset.motion = settings.appearance.reduceMotion ? 'reduced' : 'full';
  root.dataset.transparency = settings.appearance.reduceTransparency ? 'reduced' : 'full';
  root.dataset.lumenCursor = settings.cursor.style === 'native' ? 'native' : 'custom';
  root.dataset.shadows = settings.display.shadows ? 'on' : 'off';

  const accent = accents.find((a) => a.id === settings.appearance.accent) ?? accents[0];
  root.style.setProperty('--lumen-accent-h', String(accent.h));
  root.style.setProperty('--lumen-accent-s', `${accent.s}%`);
  root.style.setProperty(
    '--lumen-accent-l',
    `${theme === 'dark' ? Math.min(70, accent.l + 4) : accent.l}%`,
  );

  const scale = clamp(settings.display.scale, 0.75, 1.75);
  root.style.setProperty('--lumen-scale', String(scale));
  const fontScale = clamp(settings.appearance.fontScale, 0.9, 1.3);
  root.style.fontSize = `${13 * fontScale * scale}px`;
  root.style.setProperty('--lumen-menubar-h', `${Math.round(26 * scale)}px`);
  root.style.setProperty(
    '--lumen-taskbar-h',
    `${Math.round((settings.taskbar.size + 12) * scale)}px`,
  );
  root.style.setProperty('--lumen-window-titlebar-h', `${Math.round(36 * scale)}px`);
  root.style.setProperty(
    '--lumen-cursor-size',
    `${Math.round(20 * settings.cursor.size * scale)}px`,
  );
  root.style.colorScheme = theme;

  if (lastTheme !== theme) {
    lastTheme = theme;
    events.emit('theme:change', { theme });
  }

  // follow the OS theme while in auto mode
  if (settings.appearance.theme === 'auto' && typeof matchMedia === 'function') {
    if (!mediaQuery) mediaQuery = matchMedia('(prefers-color-scheme: dark)');
    if (!mediaListener) {
      mediaListener = () => applyThemeToDocument(settings);
      mediaQuery.addEventListener?.('change', mediaListener);
    }
  } else if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener?.('change', mediaListener);
    mediaListener = null;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

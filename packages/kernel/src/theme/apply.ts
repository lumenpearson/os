import { accents } from '@lumen/tokens';
import { events } from '../events';
import { runtimeSettings } from '../settings/runtime';
import type { Settings } from '../settings/schema';

let mediaQuery: MediaQueryList | null = null;
let mediaListener: (() => void) | null = null;
let lastTheme: 'light' | 'dark' | null = null;
/**
 * The settings the OS-theme listener should re-apply. It is held here rather
 * than captured in the listener's closure: the listener is installed once and
 * would otherwise keep replaying whichever settings happened to be current on
 * the first call, silently reverting every later change to accent, scale and
 * the rest the moment the OS flipped between light and dark.
 */
let latest: Settings | null = null;

export function resolveTheme(mode: Settings['appearance']['theme']): 'light' | 'dark' {
  if (mode !== 'auto') return mode;
  if (typeof matchMedia !== 'function') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Write the current settings into the DOM: theme, accent, scale, motion,
 * contrast, cursor. Low Power Mode is applied here rather than at each
 * consumer, so everything driven by these attributes follows it at once.
 */
export function applyThemeToDocument(stored: Settings): void {
  if (typeof document === 'undefined') return;
  const settings = runtimeSettings(stored);
  const root = document.documentElement;
  const theme = resolveTheme(settings.appearance.theme);
  root.dataset.theme = theme;
  root.dataset.contrast = settings.appearance.contrast;
  root.dataset.motion = settings.appearance.reduceMotion ? 'reduced' : 'full';

  // Blur and transparency are one decision, not two: a surface is either
  // translucent and blurred, or opaque. Reduce Transparency forces opaque, and
  // so does a blur of zero.
  const blur = clamp(settings.appearance.blur, 0, 40);
  const opaque = settings.appearance.reduceTransparency || blur === 0;
  root.dataset.transparency = opaque ? 'reduced' : 'full';
  root.style.setProperty('--lumen-blur', `${blur}px`);

  // Motion, by category. The shell and the components read these attributes,
  // so switching one off removes that animation and leaves the rest alone.
  const animation = settings.animation;
  root.dataset.animWindows = animation.windows ? 'on' : 'off';
  root.dataset.animMenus = animation.menus ? 'on' : 'off';
  root.dataset.animDialogs = animation.dialogs ? 'on' : 'off';
  root.dataset.animPanels = animation.panels ? 'on' : 'off';
  root.dataset.animPages = animation.pages ? 'on' : 'off';
  root.dataset.animPress = animation.press ? 'on' : 'off';
  root.dataset.animMinimize = animation.minimize;

  // Speed scales what is left. At 1 the stylesheet is left alone, so the
  // reduced-motion rules there keep their say; anything else is written here.
  const speed = clamp(animation.speed, 0, 1.5);
  const durations: Array<[string, number]> = [
    ['--duration-fast', 120],
    ['--duration-base', 180],
    ['--duration-slow', 260],
    ['--duration-window', 220],
  ];
  for (const [name, base] of durations) {
    if (speed === 1 || settings.appearance.reduceMotion) root.style.removeProperty(name);
    else root.style.setProperty(name, `${Math.round(base * speed)}ms`);
  }
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
  /*
   * The root every rem in the system is measured against. 16 rather than 13
   * because the tokens are written as sixteenths of a pixel size — 0.8125rem
   * is the 13px body text — which keeps them readable against the design.
   *
   * Font size moves type and the spacing that goes with it; Scale moves those
   * and the chrome heights below as well. The chrome is written in px and
   * multiplied here, so it takes `scale` once and does not double-count.
   */
  root.style.fontSize = `${16 * fontScale * scale}px`;
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
  latest = stored;
  if (settings.appearance.theme === 'auto' && typeof matchMedia === 'function') {
    if (!mediaQuery) mediaQuery = matchMedia('(prefers-color-scheme: dark)');
    if (!mediaListener) {
      mediaListener = () => {
        if (latest) applyThemeToDocument(latest);
      };
      mediaQuery.addEventListener?.('change', mediaListener);
    }
  } else if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener?.('change', mediaListener);
    mediaListener = null;
  }
}

/** Drop the OS-theme listener and forget the settings it would replay. */
export function stopFollowingSystemTheme(): void {
  if (mediaQuery && mediaListener) mediaQuery.removeEventListener?.('change', mediaListener);
  mediaListener = null;
  mediaQuery = null;
  latest = null;
  lastTheme = null;
}

function clamp(v: number, lo: number, hi: number) {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

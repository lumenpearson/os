/**
 * JS-side mirror of the design tokens that components need at runtime
 * (z-index layering, metrics, motion). Colour and type live in theme.css.
 */
export const zIndex = {
  desktop: 0,
  desktopIcons: 1,
  windowBase: 100,
  windowMax: 900,
  taskbar: 1000,
  menubar: 1001,
  menu: 1100,
  overlay: 1200,
  missionControl: 1300,
  dialog: 1400,
  toast: 1500,
  lock: 2000,
  screensaver: 2100,
  boot: 2200,
  cursor: 3000,
} as const;

export const metrics = {
  menubarHeight: 26,
  taskbarHeight: 52,
  titlebarHeight: 36,
  windowMinWidth: 320,
  windowMinHeight: 200,
  snapThreshold: 16,
  desktopIconSize: 72,
  desktopIconGap: 12,
} as const;

export const motion = {
  fast: 120,
  base: 180,
  slow: 260,
  window: 220,
  easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeSpring: 'cubic-bezier(0.32, 1.25, 0.6, 1)',
} as const;

/** Accent presets exposed in Settings → Appearance. HSL components map to --lumen-accent-h/s/l. */
export const accents = [
  { id: 'blue', label: 'Blue', h: 218, s: 92, l: 58 },
  { id: 'graphite', label: 'Graphite', h: 220, s: 6, l: 46 },
  { id: 'teal', label: 'Teal', h: 178, s: 62, l: 36 },
  { id: 'green', label: 'Green', h: 146, s: 48, l: 38 },
  { id: 'orange', label: 'Orange', h: 28, s: 88, l: 50 },
  { id: 'red', label: 'Red', h: 0, s: 66, l: 54 },
  { id: 'violet', label: 'Violet', h: 256, s: 78, l: 62 },
] as const;

export type AccentId = (typeof accents)[number]['id'];

export const fontStacks = {
  sans: "'IBM Plex Sans Variable', 'IBM Plex Sans', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace",
} as const;

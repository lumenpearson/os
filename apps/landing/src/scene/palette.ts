import { Color, SRGBColorSpace } from 'three';
import { over, type Rgba, readCssColor } from '../lib/color';

export interface ScenePalette {
  surface: Color;
  titleBar: Color;
  border: Color;
  control: Color;
  line: Color;
  accent: Color;
  /** Opacity of the colourless shadow under each window. */
  shadow: number;
}

const toColor = ({ r, g, b }: Rgba) => new Color().setRGB(r, g, b, SRGBColorSpace);

const LIGHT = {
  surface: { r: 1, g: 1, b: 1, a: 1 },
  surface2: { r: 0.925, g: 0.925, b: 0.933, a: 1 },
  surface3: { r: 0.882, g: 0.886, b: 0.898, a: 1 },
  rule: { r: 0, g: 0, b: 0, a: 0.18 },
  ink3: { r: 0.545, g: 0.561, b: 0.596, a: 1 },
  accent: { r: 0.2, g: 0.506, b: 0.949, a: 1 },
} as const;

/** Reads the token colours off the document so the scene follows the theme. */
export function readPalette(theme: 'light' | 'dark'): ScenePalette {
  const surface = readCssColor('--lumen-surface', LIGHT.surface);
  const surface2 = readCssColor('--lumen-surface-2', LIGHT.surface2);
  const surface3 = readCssColor('--lumen-surface-3', LIGHT.surface3);
  const rule = readCssColor('--lumen-rule-strong', LIGHT.rule);
  const ink3 = readCssColor('--lumen-ink-3', LIGHT.ink3);
  const accent = readCssColor('--lumen-accent', LIGHT.accent);
  return {
    surface: toColor(surface),
    titleBar: toColor(surface2),
    border: toColor(over(rule, surface)),
    control: toColor(ink3),
    line: toColor(surface3),
    accent: toColor(accent),
    shadow: theme === 'dark' ? 0.4 : 0.14,
  };
}

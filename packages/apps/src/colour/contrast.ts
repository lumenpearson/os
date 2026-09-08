/**
 * WCAG 2 contrast: relative luminance, the ratio, and the thresholds the
 * success criteria actually name.
 *
 * The numbers here are defined, not chosen, so nothing is rounded before it is
 * compared. The displayed ratio is truncated rather than rounded for the same
 * reason: 4.4999 against normal text fails 1.4.3, and printing it as "4.50"
 * beside a red verdict would look like a bug in the tool rather than a fact
 * about the colours.
 *
 * The luminance coefficients use 0.03928 as the linearisation knee. That is
 * the value written into WCAG 2.0 and still normative there; the sRGB standard
 * itself says 0.04045. They differ far below one part in a thousand of the
 * result, and this is a WCAG check, so it follows WCAG.
 */

import { clampChannel, type Rgba, rgba } from '../paint/colour';

export type ConformanceLevel = 'AA' | 'AAA';

export interface ContrastRule {
  id: string;
  /** What the criterion covers. */
  subject: string;
  level: ConformanceLevel;
  /** The success criterion, so the verdict can be checked against the spec. */
  criterion: string;
  threshold: number;
}

/**
 * 1.4.3 Contrast (Minimum) and 1.4.6 Contrast (Enhanced) for text; 1.4.11
 * Non-text Contrast for controls and meaningful graphics. WCAG 2 defines no
 * AAA level for non-text contrast, so this list has no such row and the panel
 * says as much rather than inventing one.
 */
export const CONTRAST_RULES: readonly ContrastRule[] = [
  {
    id: 'normal-aa',
    subject: 'Normal text',
    level: 'AA',
    criterion: '1.4.3',
    threshold: 4.5,
  },
  {
    id: 'normal-aaa',
    subject: 'Normal text',
    level: 'AAA',
    criterion: '1.4.6',
    threshold: 7,
  },
  { id: 'large-aa', subject: 'Large text', level: 'AA', criterion: '1.4.3', threshold: 3 },
  { id: 'large-aaa', subject: 'Large text', level: 'AAA', criterion: '1.4.6', threshold: 4.5 },
  {
    id: 'non-text-aa',
    subject: 'UI components',
    level: 'AA',
    criterion: '1.4.11',
    threshold: 3,
  },
];

/** What WCAG counts as large: 18.66px bold, or 24px at any weight. */
export const LARGE_TEXT_NOTE = 'Large text is 24px, or 18.66px bold.';

/** Relative luminance, WCAG 2 §relative luminance. */
export function relativeLuminance(colour: Rgba): number {
  const channel = (value: number) => {
    const v = clampChannel(value) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/**
 * Source-over compositing. Contrast is defined between two opaque colours, so
 * a translucent sample has to be laid on its background first — otherwise the
 * ratio describes a colour nobody can see.
 */
export function composite(source: Rgba, backdrop: Rgba): Rgba {
  const alpha = clampChannel(source.a) / 255;
  if (alpha >= 1) return { ...source, a: 255 };
  const mix = (a: number, b: number) => a * alpha + b * (1 - alpha);
  return rgba(
    mix(clampChannel(source.r), clampChannel(backdrop.r)),
    mix(clampChannel(source.g), clampChannel(backdrop.g)),
    mix(clampChannel(source.b), clampChannel(backdrop.b)),
    255,
  );
}

/** 1 to 21, lighter over darker, order independent. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The ratio between a sample and a background, with any alpha resolved. */
export function pairRatio(sample: Rgba, background: Rgba): number {
  const opaqueBackground = { ...background, a: 255 };
  return contrastRatio(composite(sample, opaqueBackground), opaqueBackground);
}

export interface ContrastVerdict extends ContrastRule {
  pass: boolean;
}

export function verdicts(ratio: number): ContrastVerdict[] {
  return CONTRAST_RULES.map((rule) => ({ ...rule, pass: ratio >= rule.threshold }));
}

/**
 * Two decimal places, truncated towards zero. Never shows a ratio the pair
 * does not reach.
 *
 * The truncation is done on the decimal expansion rather than by multiplying
 * by a hundred and flooring: 6.8999999999999995 times 100 is 690.0000000000001
 * in binary floating point, and flooring that would print 6.90 for a pair that
 * does not get there. Twenty places is far more than a ratio between 1 and 21
 * can distinguish, so the slice is exact.
 */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  const text = Math.max(0, ratio).toFixed(20);
  const point = text.indexOf('.');
  return `${text.slice(0, point)}.${text.slice(point + 1, point + 3)}`;
}

import { describe, expect, it } from 'vitest';
import { rgba } from '../paint/colour';
import {
  CONTRAST_RULES,
  composite,
  contrastRatio,
  formatRatio,
  pairRatio,
  relativeLuminance,
  verdicts,
} from './contrast';

const BLACK = rgba(0, 0, 0);
const WHITE = rgba(255, 255, 255);

describe('relative luminance', () => {
  it('runs from zero at black to one at white', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });

  it('weights green far above blue, as the coefficients say', () => {
    expect(relativeLuminance(rgba(0, 255, 0))).toBeCloseTo(0.7152, 6);
    expect(relativeLuminance(rgba(255, 0, 0))).toBeCloseTo(0.2126, 6);
    expect(relativeLuminance(rgba(0, 0, 255))).toBeCloseTo(0.0722, 6);
  });
});

describe('the ratio', () => {
  it('is 21 between black and white and 1 for a colour against itself', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    expect(contrastRatio(rgba(87, 34, 200), rgba(87, 34, 200))).toBe(1);
  });

  it('does not depend on which colour is named first', () => {
    const a = rgba(20, 90, 140);
    const b = rgba(240, 230, 12);
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it('never leaves the range the definition allows', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        const ratio = contrastRatio(rgba(r, g, 255 - r), rgba(g, 255 - g, r));
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }
    }
  });
});

describe('alpha', () => {
  it('lays a translucent colour on its background before measuring', () => {
    expect(composite(rgba(0, 0, 0, 128), WHITE)).toEqual(rgba(127, 127, 127));
    expect(composite(rgba(10, 20, 30, 255), WHITE)).toEqual(rgba(10, 20, 30));
    expect(composite(rgba(10, 20, 30, 0), WHITE)).toEqual(WHITE);
  });

  it('measures the composited colour, not the one that was typed', () => {
    // Fully transparent black over white is white: no contrast at all.
    expect(pairRatio(rgba(0, 0, 0, 0), WHITE)).toBeCloseTo(1, 10);
    expect(pairRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
  });

  it('ignores alpha on the background, which is what is behind everything', () => {
    expect(pairRatio(BLACK, rgba(255, 255, 255, 0))).toBeCloseTo(21, 10);
  });
});

describe('the WCAG thresholds', () => {
  it('states the numbers the success criteria name', () => {
    const byId = new Map(CONTRAST_RULES.map((rule) => [rule.id, rule]));
    expect(byId.get('normal-aa')?.threshold).toBe(4.5);
    expect(byId.get('normal-aaa')?.threshold).toBe(7);
    expect(byId.get('large-aa')?.threshold).toBe(3);
    expect(byId.get('large-aaa')?.threshold).toBe(4.5);
    expect(byId.get('non-text-aa')?.threshold).toBe(3);
  });

  it('claims no AAA level for non-text contrast, because WCAG 2 defines none', () => {
    expect(CONTRAST_RULES.some((r) => r.subject === 'UI components' && r.level === 'AAA')).toBe(
      false,
    );
  });

  it('passes a rule only at or above its threshold', () => {
    const at = new Map(verdicts(4.5).map((v) => [v.id, v.pass]));
    expect(at.get('normal-aa')).toBe(true);
    expect(at.get('normal-aaa')).toBe(false);
    const under = new Map(verdicts(4.4999).map((v) => [v.id, v.pass]));
    expect(under.get('normal-aa')).toBe(false);
    expect(under.get('large-aa')).toBe(true);
  });
});

describe('printing the ratio', () => {
  it('truncates rather than rounds, so 4.49 never reads as a pass', () => {
    expect(formatRatio(4.4999)).toBe('4.49');
    expect(formatRatio(4.5)).toBe('4.50');
    expect(formatRatio(6.999)).toBe('6.99');
    expect(formatRatio(21)).toBe('21.00');
    expect(formatRatio(1)).toBe('1.00');
  });

  it('never prints a number the pair does not reach', () => {
    for (let step = 0; step <= 200; step += 1) {
      const ratio = 1 + (step / 200) * 20;
      expect(Number(formatRatio(ratio))).toBeLessThanOrEqual(ratio);
      // A hundredth low at worst; floating point can put an exact 2.3 a
      // fraction below itself, and truncating that is the safe direction.
      expect(Number(formatRatio(ratio))).toBeGreaterThan(ratio - 0.011);
    }
  });

  it('says so when there is no number', () => {
    expect(formatRatio(Number.NaN)).toBe('—');
  });
});

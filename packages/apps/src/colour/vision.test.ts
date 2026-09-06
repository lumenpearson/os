import { describe, expect, it } from 'vitest';
import { rgba } from '../paint/colour';
import {
  applyMatrix,
  CONE_SUBSTITUTION,
  LMS_TO_RGB,
  RGB_TO_LMS,
  simulate,
  VISION_TYPES,
} from './vision';

const TYPES = VISION_TYPES.map((type) => type.id);

describe('the matrices themselves', () => {
  it('takes linear RGB to LMS and back again', () => {
    for (const vector of [
      [1, 1, 1],
      [1, 0, 0],
      [0.2, 0.7, 0.4],
    ] as const) {
      const back = applyMatrix(LMS_TO_RGB, applyMatrix(RGB_TO_LMS, vector));
      expect(back[0]).toBeCloseTo(vector[0], 5);
      expect(back[1]).toBeCloseTo(vector[1], 5);
      expect(back[2]).toBeCloseTo(vector[2], 5);
    }
  });

  it('leaves the white point where it is, which is what fixes each plane', () => {
    const white = applyMatrix(RGB_TO_LMS, [1, 1, 1]);
    for (const type of TYPES) {
      const reduced = applyMatrix(CONE_SUBSTITUTION[type], white);
      expect(reduced[0], type).toBeCloseTo(white[0], 3);
      expect(reduced[1], type).toBeCloseTo(white[1], 3);
      expect(reduced[2], type).toBeCloseTo(white[2], 3);
    }
  });
});

describe('simulating a colour', () => {
  it('leaves the neutral axis alone: black, grey and white are already on every plane', () => {
    for (const type of TYPES) {
      expect(simulate(rgba(0, 0, 0), type), type).toEqual(rgba(0, 0, 0));
      expect(simulate(rgba(128, 128, 128), type), type).toEqual(rgba(128, 128, 128));
      expect(simulate(rgba(255, 255, 255), type), type).toEqual(rgba(255, 255, 255));
    }
  });

  it('gives the published results for red', () => {
    // Protanopia and deuteranopia turn red into the dark and mid yellows that
    // every implementation of these matrices produces.
    expect(simulate(rgba(255, 0, 0), 'protanopia')).toEqual(rgba(94, 94, 13));
    expect(simulate(rgba(255, 0, 0), 'deuteranopia')).toEqual(rgba(147, 147, 0));
  });

  it('collapses red and green towards one another for the two red-green cases', () => {
    for (const type of ['protanopia', 'deuteranopia'] as const) {
      const red = simulate(rgba(255, 0, 0), type);
      const green = simulate(rgba(0, 255, 0), type);
      // Both lose the red/green axis: what is left has equal red and green.
      expect(Math.abs(red.r - red.g), type).toBeLessThanOrEqual(1);
      expect(Math.abs(green.r - green.g), type).toBeLessThanOrEqual(1);
    }
  });

  it('is idempotent, because projecting onto a plane twice is projecting once', () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          for (const type of TYPES) {
            const once = simulate(rgba(r, g, b), type);
            expect(simulate(once, type), `${type} ${r},${g},${b}`).toEqual(once);
          }
        }
      }
    }
  });

  it('carries alpha through untouched: transparency is not a cone response', () => {
    for (const type of TYPES) {
      expect(simulate(rgba(200, 30, 90, 77), type).a, type).toBe(77);
    }
  });

  it('stays inside the display gamut even where the plane leaves it', () => {
    for (const type of TYPES) {
      for (const colour of [rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 0, 255)]) {
        const seen = simulate(colour, type);
        for (const channel of [seen.r, seen.g, seen.b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});

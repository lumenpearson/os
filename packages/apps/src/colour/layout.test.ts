import { describe, expect, it } from 'vitest';
import {
  COLUMNS_WIDTH,
  fieldHeightFor,
  layoutFor,
  MAX_FIELD_HEIGHT,
  MIN_FIELD_HEIGHT,
} from './layout';

describe('the field height', () => {
  it('never drops below the floor or rises above the ceiling', () => {
    for (const height of [0, 1, 100, 420, 640, 1000, 4000]) {
      const field = fieldHeightFor(height);
      expect(field).toBeGreaterThanOrEqual(MIN_FIELD_HEIGHT);
      expect(field).toBeLessThanOrEqual(MAX_FIELD_HEIGHT);
    }
  });

  it('never grows when the window shrinks', () => {
    let previous = fieldHeightFor(0);
    for (let height = 0; height <= 2000; height += 25) {
      const field = fieldHeightFor(height);
      expect(field).toBeGreaterThanOrEqual(previous);
      previous = field;
    }
  });

  it('leaves most of a short window to the readouts', () => {
    expect(fieldHeightFor(420)).toBeLessThan(420 / 2);
  });
});

describe('the columns', () => {
  it('stacks below the threshold and splits at it', () => {
    expect(layoutFor({ width: COLUMNS_WIDTH - 1, height: 640 }).columns).toBe(false);
    expect(layoutFor({ width: COLUMNS_WIDTH, height: 640 }).columns).toBe(true);
  });

  it('reads the window, not the screen: an unmeasured window stacks', () => {
    expect(layoutFor({ width: 0, height: 0 })).toEqual({
      columns: false,
      fieldHeight: MIN_FIELD_HEIGHT,
    });
  });
});

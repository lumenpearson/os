import { describe, expect, it } from 'vitest';
import { SCREENSAVERS, type ScreensaverId, screensaverById } from './screensavers';

describe('SCREENSAVERS', () => {
  it('offers every id the settings can hold, exactly once', () => {
    // The record is exhaustive over the union, so a new id that never reaches
    // the catalogue fails to compile here rather than vanishing from Settings.
    const expected: Record<ScreensaverId, true> = {
      none: true,
      clock: true,
      drift: true,
      starfield: true,
      contour: true,
      rings: true,
    };
    expect(SCREENSAVERS.map((preset) => preset.id).sort()).toEqual(Object.keys(expected).sort());
  });

  it('leads with the one that draws nothing', () => {
    expect(SCREENSAVERS[0]?.id).toBe('none');
  });

  it('names and describes each one', () => {
    for (const preset of SCREENSAVERS) {
      expect(preset.name).toMatch(/^[A-Z]/);
      expect(preset.description.endsWith('.')).toBe(true);
    }
  });
});

describe('screensaverById', () => {
  it('finds a preset', () => {
    expect(screensaverById('rings')?.name).toBe('Rings');
  });

  it('has nothing for an id that was never shipped', () => {
    expect(screensaverById('aquarium')).toBeUndefined();
  });
});

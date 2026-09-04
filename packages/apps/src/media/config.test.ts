import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, RATES, sanitizeConfig, stepRate } from './config';

describe('sanitizeConfig', () => {
  it('returns the default for anything that is not a configuration', () => {
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig('nonsense')).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig([])).toEqual(DEFAULT_CONFIG);
  });

  it('keeps well-formed values', () => {
    const config = sanitizeConfig({
      queue: {
        tracks: [{ path: '/m/a.mp3', name: 'a.mp3', kind: 'audio' }],
        index: 0,
        loop: 'all',
        shuffle: true,
        seed: 12,
      },
      volume: 0.25,
      muted: true,
      rate: 1.5,
      showPlaylist: false,
      showVisualiser: false,
    });
    expect(config.queue.tracks).toHaveLength(1);
    expect(config.queue.loop).toBe('all');
    expect(config.queue.shuffle).toBe(true);
    expect(config.queue.seed).toBe(12);
    expect(config).toMatchObject({ volume: 0.25, muted: true, rate: 1.5, showPlaylist: false });
  });

  it('drops tracks without a usable path or kind, and duplicates', () => {
    const config = sanitizeConfig({
      queue: {
        tracks: [
          { path: '/m/a.mp3', kind: 'audio' },
          { path: '/m/a.mp3', kind: 'audio' },
          { path: '/m/b.txt', kind: 'text' },
          { name: 'orphan' },
          42,
        ],
      },
    });
    expect(config.queue.tracks).toEqual([{ path: '/m/a.mp3', name: 'a.mp3', kind: 'audio' }]);
  });

  it('clamps the numbers into their ranges', () => {
    expect(sanitizeConfig({ volume: 4 }).volume).toBe(1);
    expect(sanitizeConfig({ volume: -1 }).volume).toBe(0);
    expect(sanitizeConfig({ rate: 9 }).rate).toBe(2);
    expect(sanitizeConfig({ rate: 0.1 }).rate).toBe(0.5);
    expect(sanitizeConfig({ volume: 'loud' }).volume).toBe(DEFAULT_CONFIG.volume);
  });

  it('puts the index back inside the playlist', () => {
    const tracks = [
      { path: '/m/a.mp3', kind: 'audio' },
      { path: '/m/b.mp3', kind: 'audio' },
    ];
    expect(sanitizeConfig({ queue: { tracks, index: 9 } }).queue.index).toBe(0);
    expect(sanitizeConfig({ queue: { tracks, index: 1 } }).queue.index).toBe(1);
    expect(sanitizeConfig({ queue: { tracks: [], index: 3 } }).queue.index).toBe(-1);
    expect(sanitizeConfig({ queue: { tracks, loop: 'sometimes' } }).queue.loop).toBe('off');
  });
});

describe('stepRate', () => {
  it('walks the ladder and stops at both ends', () => {
    expect(stepRate(1, 1)).toBe(1.25);
    expect(stepRate(1, -1)).toBe(0.75);
    expect(stepRate(2, 1)).toBe(2);
    expect(stepRate(0.5, -1)).toBe(0.5);
  });

  it('starts from the nearest rate on the ladder', () => {
    expect(stepRate(1.3, 1)).toBe(1.5);
    expect(RATES).toContain(stepRate(1.3, -1));
  });
});

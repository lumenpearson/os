import { describe, expect, it } from 'vitest';
import {
  clampTime,
  clampVolume,
  isSeekable,
  playbackCommand,
  SEEK_STEP,
  SEEK_STEP_LARGE,
  seekBy,
  VOLUME_STEP,
  volumeLevel,
} from './playback';

const key = (key: string, modifiers: Record<string, boolean> = {}) => ({ key, ...modifiers });

describe('playbackCommand', () => {
  it('toggles playback on the space bar', () => {
    expect(playbackCommand(key(' '))).toEqual({ type: 'toggle' });
    expect(playbackCommand(key('Spacebar'))).toEqual({ type: 'toggle' });
  });

  it('seeks with the left and right arrows', () => {
    expect(playbackCommand(key('ArrowRight'))).toEqual({ type: 'seek', delta: SEEK_STEP });
    expect(playbackCommand(key('ArrowLeft'))).toEqual({ type: 'seek', delta: -SEEK_STEP });
  });

  it('seeks further with Shift held', () => {
    expect(playbackCommand(key('ArrowRight', { shiftKey: true }))).toEqual({
      type: 'seek',
      delta: SEEK_STEP_LARGE,
    });
    expect(playbackCommand(key('ArrowLeft', { shiftKey: true }))).toEqual({
      type: 'seek',
      delta: -SEEK_STEP_LARGE,
    });
  });

  it('moves the volume with the up and down arrows', () => {
    expect(playbackCommand(key('ArrowUp'))).toEqual({ type: 'volume', delta: VOLUME_STEP });
    expect(playbackCommand(key('ArrowDown'))).toEqual({ type: 'volume', delta: -VOLUME_STEP });
  });

  it('jumps to either end', () => {
    expect(playbackCommand(key('Home'))).toEqual({ type: 'start' });
    expect(playbackCommand(key('End'))).toEqual({ type: 'end' });
  });

  it('mutes on M, in either case', () => {
    expect(playbackCommand(key('m'))).toEqual({ type: 'mute' });
    expect(playbackCommand(key('M', { shiftKey: true }))).toEqual({ type: 'mute' });
  });

  it('leaves modified keys to the menubar', () => {
    expect(playbackCommand(key(' ', { metaKey: true }))).toBeNull();
    expect(playbackCommand(key('ArrowRight', { ctrlKey: true }))).toBeNull();
    expect(playbackCommand(key('m', { altKey: true }))).toBeNull();
  });

  it('ignores keys it has no command for', () => {
    expect(playbackCommand(key('Tab'))).toBeNull();
    expect(playbackCommand(key('q'))).toBeNull();
  });
});

describe('isSeekable', () => {
  it('accepts a real duration only', () => {
    expect(isSeekable(12.5)).toBe(true);
    expect(isSeekable(0)).toBe(false);
    expect(isSeekable(Number.NaN)).toBe(false);
    expect(isSeekable(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('clampTime', () => {
  it('keeps a position inside the media', () => {
    expect(clampTime(5, 30)).toBe(5);
    expect(clampTime(-2, 30)).toBe(0);
    expect(clampTime(90, 30)).toBe(30);
  });

  it('reads a missing position as the start', () => {
    expect(clampTime(Number.NaN, 30)).toBe(0);
  });

  it('does not invent an end for a stream', () => {
    expect(clampTime(90, Number.POSITIVE_INFINITY)).toBe(90);
    expect(clampTime(90, Number.NaN)).toBe(90);
  });
});

describe('seekBy', () => {
  it('steps forward and back', () => {
    expect(seekBy(10, 5, 60)).toBe(15);
    expect(seekBy(10, -5, 60)).toBe(5);
  });

  it('stops at both ends', () => {
    expect(seekBy(2, -5, 60)).toBe(0);
    expect(seekBy(58, 5, 60)).toBe(60);
  });

  it('treats an unknown position as the start', () => {
    expect(seekBy(Number.NaN, 5, 60)).toBe(5);
  });
});

describe('clampVolume', () => {
  it('holds the range the element accepts', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(4)).toBe(1);
  });

  it('rounds so repeated steps land on round numbers', () => {
    expect(clampVolume(0.30000000000000004)).toBe(0.3);
    expect(clampVolume(Number.NaN)).toBe(1);
  });
});

describe('volumeLevel', () => {
  it('names the glyph the button shows', () => {
    expect(volumeLevel(0.8, false)).toBe('high');
    expect(volumeLevel(0.2, false)).toBe('low');
    expect(volumeLevel(0, false)).toBe('muted');
  });

  it('reads muted whatever the volume is', () => {
    expect(volumeLevel(0.9, true)).toBe('muted');
  });
});

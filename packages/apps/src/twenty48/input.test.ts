import { describe, expect, it } from 'vitest';
import { directionForKey, SWIPE_THRESHOLD, swipeDirection } from './input';

describe('directionForKey', () => {
  it('reads the arrow keys', () => {
    expect(directionForKey('ArrowLeft')).toBe('left');
    expect(directionForKey('ArrowRight')).toBe('right');
    expect(directionForKey('ArrowUp')).toBe('up');
    expect(directionForKey('ArrowDown')).toBe('down');
  });

  it('reads WASD, in either case', () => {
    expect(directionForKey('w')).toBe('up');
    expect(directionForKey('a')).toBe('left');
    expect(directionForKey('s')).toBe('down');
    expect(directionForKey('d')).toBe('right');
    expect(directionForKey('W')).toBe('up');
    expect(directionForKey('D')).toBe('right');
  });

  it('ignores everything else', () => {
    for (const key of ['Enter', ' ', 'Tab', 'z', 'Escape', 'ArrowLeftRight', '']) {
      expect(directionForKey(key)).toBeNull();
    }
  });

  it('does not lowercase an arrow into a letter', () => {
    expect(directionForKey('arrowleft')).toBeNull();
  });
});

describe('swipeDirection', () => {
  const far = SWIPE_THRESHOLD + 10;

  it('reads a drag along each axis', () => {
    expect(swipeDirection(-far, 0)).toBe('left');
    expect(swipeDirection(far, 0)).toBe('right');
    expect(swipeDirection(0, -far)).toBe('up');
    expect(swipeDirection(0, far)).toBe('down');
  });

  it('gives a diagonal to the longer axis', () => {
    expect(swipeDirection(far, far - 5)).toBe('right');
    expect(swipeDirection(far - 5, far)).toBe('down');
    expect(swipeDirection(-far, -far + 1)).toBe('left');
  });

  it('ignores a drag too short to be one', () => {
    expect(swipeDirection(0, 0)).toBeNull();
    expect(swipeDirection(SWIPE_THRESHOLD - 1, SWIPE_THRESHOLD - 1)).toBeNull();
    expect(swipeDirection(-5, 8)).toBeNull();
  });

  it('takes the threshold as an argument', () => {
    expect(swipeDirection(10, 0, 8)).toBe('right');
    expect(swipeDirection(10, 0, 40)).toBeNull();
  });

  it('reads exactly the threshold as a swipe', () => {
    expect(swipeDirection(SWIPE_THRESHOLD, 0)).toBe('right');
  });

  it('refuses coordinates that are not numbers', () => {
    expect(swipeDirection(Number.NaN, 100)).toBeNull();
    expect(swipeDirection(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

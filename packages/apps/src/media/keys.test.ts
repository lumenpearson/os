import { describe, expect, it } from 'vitest';
import { commandForKey, isControlTarget, SEEK_STEP, SEEK_STEP_LARGE, VOLUME_STEP } from './keys';

describe('commandForKey', () => {
  it('plays and pauses on Space', () => {
    expect(commandForKey({ key: ' ' })).toEqual({ type: 'toggle' });
  });

  it('seeks five seconds, thirty with Shift', () => {
    expect(commandForKey({ key: 'ArrowRight' })).toEqual({ type: 'seek', delta: SEEK_STEP });
    expect(commandForKey({ key: 'ArrowLeft' })).toEqual({ type: 'seek', delta: -SEEK_STEP });
    expect(commandForKey({ key: 'ArrowRight', shiftKey: true })).toEqual({
      type: 'seek',
      delta: SEEK_STEP_LARGE,
    });
    expect(commandForKey({ key: 'ArrowLeft', shiftKey: true })).toEqual({
      type: 'seek',
      delta: -SEEK_STEP_LARGE,
    });
  });

  it('moves the volume with the vertical arrows', () => {
    expect(commandForKey({ key: 'ArrowUp' })).toEqual({ type: 'volume', delta: VOLUME_STEP });
    expect(commandForKey({ key: 'ArrowDown' })).toEqual({ type: 'volume', delta: -VOLUME_STEP });
  });

  it('maps the letters, either case', () => {
    expect(commandForKey({ key: 'm' })).toEqual({ type: 'mute' });
    expect(commandForKey({ key: 'M', shiftKey: true })).toEqual({ type: 'mute' });
    expect(commandForKey({ key: 'f' })).toEqual({ type: 'fullscreen' });
    expect(commandForKey({ key: 'n' })).toEqual({ type: 'next' });
    expect(commandForKey({ key: 'P' })).toEqual({ type: 'previous' });
  });

  it('jumps to a percentage on the number keys', () => {
    expect(commandForKey({ key: '0' })).toEqual({ type: 'fraction', value: 0 });
    expect(commandForKey({ key: '5' })).toEqual({ type: 'fraction', value: 0.5 });
    expect(commandForKey({ key: '9' })).toEqual({ type: 'fraction', value: 0.9 });
  });

  it('stands down for modified keys and anything unmapped', () => {
    expect(commandForKey({ key: 'n', ctrlKey: true })).toBeNull();
    expect(commandForKey({ key: ' ', metaKey: true })).toBeNull();
    expect(commandForKey({ key: 'ArrowUp', altKey: true })).toBeNull();
    expect(commandForKey({ key: 'q' })).toBeNull();
    expect(commandForKey({ key: 'Enter' })).toBeNull();
  });
});

describe('isControlTarget', () => {
  it('recognises the controls that own their own keys', () => {
    expect(isControlTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isControlTarget({ tagName: 'button' })).toBe(true);
    expect(isControlTarget({ isContentEditable: true })).toBe(true);
    expect(isControlTarget({ tagName: 'DIV', getAttribute: () => 'slider' })).toBe(true);
  });

  it('lets plain elements through', () => {
    expect(isControlTarget({ tagName: 'DIV', getAttribute: () => null })).toBe(false);
    expect(isControlTarget({ tagName: 'VIDEO' })).toBe(false);
    expect(isControlTarget(null)).toBe(false);
    expect(isControlTarget('body')).toBe(false);
  });
});

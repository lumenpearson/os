import { useSettingsStore } from '@lumen/kernel';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playSound } from './sounds';

/**
 * The gates in front of the synthesiser, which are the whole of what these
 * settings do. A counting stand-in for AudioContext stands in for the sound
 * itself: whether an oscillator was asked for is the observable difference
 * between a sound playing and not.
 */
let oscillators = 0;

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    oscillators += 1;
    return {
      type: '',
      frequency: { value: 0 },
      connect: () => ({ connect: () => {} }),
      start: () => {},
      stop: () => {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => ({ connect: () => {} }),
    };
  }
}

beforeEach(() => {
  oscillators = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  useSettingsStore
    .getState()
    .patch('sound', { muted: false, uiSounds: true, startupSound: true, volume: 0.5 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the startup chime', () => {
  it('sounds when its own switch is on', () => {
    playSound('startup');
    expect(oscillators).toBeGreaterThan(0);
  });

  it('stays quiet when its own switch is off, while the rest still answer', () => {
    useSettingsStore.getState().patch('sound', { startupSound: false });
    playSound('startup');
    expect(oscillators).toBe(0);
    // The switch is about the chime at sign-in, not about interface sounds.
    playSound('notify');
    expect(oscillators).toBeGreaterThan(0);
  });

  it('stays quiet when the machine is muted, whatever its own switch says', () => {
    useSettingsStore.getState().patch('sound', { muted: true });
    playSound('startup');
    expect(oscillators).toBe(0);
  });
});

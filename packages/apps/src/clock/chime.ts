/**
 * The sound a finished countdown makes: three short sine notes with a fixed
 * envelope, synthesised rather than shipped as a file.
 *
 * The shell has its own synthesiser (`packages/shell/src/sounds.ts`) but it
 * sits above the apps in the dependency order, so an app cannot import it;
 * this is the same technique, at the alarm's own level and length. It follows
 * Settings → Sound for mute and volume, and it never throws: where Web Audio
 * is missing, or the browser has not yet had the gesture it wants before
 * making noise, the timer simply finishes quietly.
 */

import { getSettings } from '@lumen/kernel';

/** [frequency in Hz, start in seconds, length in seconds] */
const NOTES: ReadonlyArray<readonly [number, number, number]> = [
  [880, 0, 0.16],
  [1174, 0.18, 0.16],
  [1568, 0.36, 0.42],
];

let shared: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    if (!shared) shared = new AudioContext();
    if (shared.state === 'suspended') void shared.resume().catch(() => {});
    return shared;
  } catch {
    return null;
  }
}

export function playChime(): void {
  const sound = getSettings().sound;
  if (sound.muted || sound.volume <= 0) return;
  const context = audio();
  if (!context) return;
  const level = 0.09 * sound.volume;
  try {
    for (const [frequency, start, length] of NOTES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = context.currentTime + start;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + length + 0.02);
    }
  } catch {
    // A context that will not run is not worth an error dialog.
  }
}

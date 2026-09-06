/**
 * Interface sounds synthesised with Web Audio: short, quiet, no samples to
 * ship. Volume follows Settings → Sound. Silent when the context is blocked
 * (no user gesture yet) — it never throws.
 */
import { getSettings } from '@lumen/kernel';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export type SoundName = 'notify' | 'error' | 'unlock' | 'startup';

const PATTERNS: Record<SoundName, Array<[frequency: number, start: number, duration: number]>> = {
  notify: [
    [880, 0, 0.08],
    [1174, 0.09, 0.12],
  ],
  error: [[220, 0, 0.16]],
  unlock: [
    [660, 0, 0.06],
    [990, 0.07, 0.1],
  ],
  startup: [
    [523, 0, 0.14],
    [659, 0.15, 0.14],
    [784, 0.3, 0.22],
  ],
};

export function playSound(name: SoundName): void {
  const s = getSettings().sound;
  if (s.muted || !s.uiSounds) return;
  // The chime at sign-in has a switch of its own: someone who wants the
  // interface to answer them may still not want the room to hear the machine
  // start.
  if (name === 'startup' && !s.startupSound) return;
  const ac = context();
  if (!ac) return;
  const gainLevel = 0.06 * s.volume;
  for (const [freq, start, duration] of PATTERNS[name]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = ac.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainLevel, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}

import { create } from 'zustand';
import { events } from '../events';
import type { SessionState } from '../types';

const MAX_FREE_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

interface SessionStore {
  state: SessionState;
  /** Epoch ms of the last user input; drives auto-lock and the screensaver. */
  lastActivity: number;
  screensaverActive: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  bootedAt: number;
  /** Set when the user chose Shut Down / Restart, for the power screen. */
  powerReason: 'shutdown' | 'restart' | null;

  transition: (to: SessionState) => void;
  touch: () => void;
  setScreensaver: (active: boolean) => void;
  recordFailedAttempt: () => void;
  clearFailedAttempts: () => void;
  /** Remaining lockout milliseconds, 0 if unlocked. */
  lockoutRemaining: () => number;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  state: 'booting',
  lastActivity: Date.now(),
  screensaverActive: false,
  failedAttempts: 0,
  lockedUntil: null,
  bootedAt: Date.now(),
  powerReason: null,

  transition: (to) => {
    const from = get().state;
    if (from === to) return;
    set({
      state: to,
      lastActivity: Date.now(),
      screensaverActive: false,
      powerReason: to === 'shutdown' ? 'shutdown' : to === 'restarting' ? 'restart' : null,
    });
    events.emit('session:change', { from, to });
  },

  touch: () => {
    const now = Date.now();
    const s = get();
    if (now - s.lastActivity > 1000 || s.screensaverActive) {
      set({ lastActivity: now, screensaverActive: false });
      events.emit('session:activity', { at: now });
    }
  },

  setScreensaver: (active) => set({ screensaverActive: active }),

  recordFailedAttempt: () => {
    const attempts = get().failedAttempts + 1;
    const lockedUntil =
      attempts >= MAX_FREE_ATTEMPTS
        ? Date.now() + LOCKOUT_MS * (attempts - MAX_FREE_ATTEMPTS + 1)
        : null;
    set({ failedAttempts: attempts, lockedUntil });
  },

  clearFailedAttempts: () => set({ failedAttempts: 0, lockedUntil: null }),

  lockoutRemaining: () => {
    const until = get().lockedUntil;
    if (!until) return 0;
    return Math.max(0, until - Date.now());
  },
}));

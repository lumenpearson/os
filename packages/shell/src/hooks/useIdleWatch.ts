import { getSettings, useSessionStore } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { useEffect } from 'react';

/**
 * Tracks user activity and enforces the idle policies: screensaver after N
 * minutes, auto-lock after M minutes, sleep after K minutes. One interval,
 * cheap checks.
 */
export function useIdleWatch() {
  const kernel = useKernel();
  useEffect(() => {
    const touch = () => useSessionStore.getState().touch();
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
      window.addEventListener(ev, touch, opts);
    }
    const id = setInterval(() => {
      const session = useSessionStore.getState();
      const s = getSettings();
      const idleMs = Date.now() - session.lastActivity;
      const idleMin = idleMs / 60_000;
      if (session.state === 'desktop') {
        if (s.power.sleepAfterMinutes > 0 && idleMin >= s.power.sleepAfterMinutes) {
          kernel.sleep();
          return;
        }
        if (s.lock.autoLockMinutes > 0 && idleMin >= s.lock.autoLockMinutes) {
          kernel.lock();
          return;
        }
      }
      if (session.state === 'desktop' || session.state === 'locked') {
        const wantSaver =
          s.lock.screensaver !== 'none' &&
          s.lock.screensaverMinutes > 0 &&
          idleMin >= s.lock.screensaverMinutes;
        if (wantSaver !== session.screensaverActive) session.setScreensaver(wantSaver);
      }
    }, 5000);
    return () => {
      for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
        window.removeEventListener(ev, touch, opts);
      }
      clearInterval(id);
    };
  }, [kernel]);
}

/**
 * The impure edges of the monitor: a frame counter, page visibility and the
 * one-shot host lookup. The arithmetic they feed lives in metrics.ts.
 */
import { usePlatform } from '@lumen/kernel/react';
import type { SystemInfo } from '@lumen/platform';
import { useCallback, useEffect, useRef, useState } from 'react';
import { frameRate } from './metrics';

/**
 * Counts animation frames while `active`. `read()` returns the frame rate
 * since the previous read and starts a new window, so the sampler decides the
 * resolution. Nothing here re-renders: the count lives in a ref.
 */
export function useFrameCounter(active: boolean): () => number | null {
  const state = useRef({ frames: 0, since: 0 });

  useEffect(() => {
    if (!active) return;
    state.current = { frames: 0, since: performance.now() };
    let raf = requestAnimationFrame(function loop() {
      state.current.frames += 1;
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return useCallback(() => {
    const now = performance.now();
    const { frames, since } = state.current;
    state.current = { frames: 0, since: now };
    if (since === 0) return null;
    return frameRate(frames, now - since);
  }, []);
}

/** True while this document is on screen. Sampling stops when it is not. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** Host description, read once. It does not change while the OS runs. */
export function useSystemInfo(): SystemInfo | null {
  const platform = usePlatform();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    let live = true;
    platform.system
      .info()
      .then((value) => {
        if (live) setInfo(value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [platform]);
  return info;
}

/**
 * Logical cores. On the desktop the host reports them; in a browser the only
 * real source is navigator.hardwareConcurrency, and it may be absent.
 */
export function logicalCores(): number | null {
  if (typeof navigator === 'undefined') return null;
  const cores = navigator.hardwareConcurrency;
  return typeof cores === 'number' && cores > 0 ? cores : null;
}

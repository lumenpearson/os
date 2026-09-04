import { usePlatform } from '@lumen/kernel/react';
import type { SystemInfo } from '@lumen/platform';
import { useEffect, useState } from 'react';

export interface SystemInfoState {
  info: SystemInfo | null;
  /** When `info` was read, so live counters (uptime) can extrapolate. */
  fetchedAt: number;
}

/** Host information, read once per mount. */
export function useSystemInfo(): SystemInfoState {
  const platform = usePlatform();
  const [state, setState] = useState<SystemInfoState>({ info: null, fetchedAt: 0 });
  useEffect(() => {
    let live = true;
    platform.system
      .info()
      .then((info) => live && setState({ info, fetchedAt: Date.now() }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [platform]);
  return state;
}

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

function readViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 0, height: 0, dpr: 1 };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

/** The browser viewport, updated on resize. */
export function useViewport(): Viewport {
  const [vp, setVp] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setVp(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}

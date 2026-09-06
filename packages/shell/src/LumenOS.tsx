import { builtinApps } from '@lumen/apps';
import { createKernel, type Kernel, type SessionState, useSessionStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BootScreen } from './boot/BootScreen';
import { CursorLayer } from './cursor/CursorLayer';
import { useHostFocus } from './hooks/useHostFocus';
import { useIdleWatch } from './hooks/useIdleWatch';
import { PerformanceOverlay } from './perf/PerformanceOverlay';
import { PowerScreen } from './power/PowerScreen';
import { ScreensaverLayer } from './screensaver/ScreensaverLayer';
import { playSound } from './sounds';

const Desktop = lazy(() => import('./desktop/Desktop'));
const LockScreen = lazy(() => import('./lock/LockScreen'));
const SetupAssistant = lazy(() => import('./setup/SetupAssistant'));

export interface LumenOSProps {
  /** Version string shown in About; hosts pass their package version. */
  appVersion?: string;
  /** Skip the setup assistant with a passwordless user (demos, tests). */
  autoSetup?: { name: string } | null;
}

/** The whole operating environment. Mount once, full-viewport. */
export function LumenOS({ appVersion = '0.1.0', autoSetup = null }: LumenOSProps) {
  const [kernel, setKernel] = useState<Kernel | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let instance: Kernel | null = null;
    (async () => {
      try {
        const platform = await createPlatform(appVersion);
        instance = createKernel({ platform, apps: builtinApps, autoSetup });
        if (cancelled) return;
        setKernel(instance);
        const started = performance.now();
        await instance.boot();
        // keep the boot screen up long enough to read, but never block a fast machine for long
        const remaining = Math.max(0, 900 - (performance.now() - started));
        setTimeout(() => !cancelled && setReady(true), remaining);
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, [appVersion, autoSetup]);

  if (bootError) return <BootScreen error={bootError} />;
  if (!kernel || !ready) return <BootScreen />;

  return (
    <KernelProvider kernel={kernel}>
      <DialogProvider>
        <Session />
        <ScreensaverLayer />
        <CursorLayer />
      </DialogProvider>
    </KernelProvider>
  );
}

function Session() {
  const state = useSessionStore((s) => s.state);
  useIdleWatch();
  useHostFocus();
  useStartupSound(state);
  return (
    <Suspense fallback={<BootScreen />}>
      <SessionView state={state} />
      <PerformanceOverlay />
    </Suspense>
  );
}

/**
 * The chime, once, the first time the desktop appears in this session.
 * Locking and unlocking again is not a start, so it does not sound twice;
 * `playSound` is silent anyway until the browser has had a gesture, which
 * unlocking provides.
 */
function useStartupSound(state: SessionState): void {
  const sounded = useRef(false);
  useEffect(() => {
    if (state !== 'desktop' || sounded.current) return;
    sounded.current = true;
    playSound('startup');
  }, [state]);
}

function SessionView({ state }: { state: SessionState }) {
  switch (state) {
    case 'booting':
      return <BootScreen />;
    case 'setup':
      return <SetupAssistant />;
    case 'locked':
      return <LockScreen />;
    case 'desktop':
      return <Desktop />;
    case 'sleeping':
    case 'shutdown':
    case 'restarting':
      return <PowerScreen state={state} />;
  }
}

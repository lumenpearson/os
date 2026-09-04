import { Canvas, type Frameloop, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { PerspectiveCamera } from 'three';
import type { Theme } from '../lib/theme';
import { useReducedMotion } from '../lib/useMediaQuery';
import { readPalette } from './palette';
import { Stack } from './Windows';

interface HeroSceneProps {
  theme: Theme;
}

/** Pulls the camera back on narrow containers so the whole stack stays in frame. */
function Framing() {
  const aspect = useThree((state) => state.viewport.aspect);
  const camera = useThree((state) => state.camera as PerspectiveCamera);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    camera.position.z = Math.max(8.2, 11.9 / aspect);
    camera.updateProjectionMatrix();
    invalidate();
  }, [aspect, camera, invalidate]);
  return null;
}

/**
 * The floating-window composition behind the hero. Renders continuously while
 * on screen, holds a single frame under reduced motion, and stops entirely
 * when the tab is hidden or the hero has scrolled away.
 */
export default function HeroScene({ theme }: HeroSceneProps) {
  const reducedMotion = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  const [onScreen, setOnScreen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const update = () => setTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setOnScreen(entry.isIntersecting);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // The tokens are read after the layout effect that puts `theme` on <html>.
  const [palette, setPalette] = useState(() => readPalette(theme));
  useEffect(() => {
    setPalette(readPalette(theme));
  }, [theme]);

  const frameloop: Frameloop =
    !tabVisible || !onScreen ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 transition-opacity duration-(--duration-base) ease-(--ease-standard)"
      style={{ opacity: ready ? 1 : 0 }}
      aria-hidden="true"
    >
      <Canvas
        flat
        dpr={[1, 1.5]}
        frameloop={frameloop}
        camera={{ position: [0, 0, 8], fov: 30, near: 1, far: 20 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power', stencil: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          setReady(true);
        }}
        style={{ pointerEvents: 'none' }}
      >
        <Framing />
        <Stack palette={palette} animate={!reducedMotion} />
      </Canvas>
    </div>
  );
}

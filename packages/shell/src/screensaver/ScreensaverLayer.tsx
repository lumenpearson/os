import { useSessionStore } from '@lumen/kernel';
import { useClock, useSettings } from '@lumen/kernel/react';
import { useEffect, useRef } from 'react';

/** Idle screensaver. Any input dismisses it; the session store decides when it shows. */
export function ScreensaverLayer() {
  const active = useSessionStore((s) => s.screensaverActive);
  const kind = useSettings().lock.screensaver;
  if (!active || kind === 'none') return null;
  return (
    <div
      className="fixed inset-0 z-[2100] bg-black select-none"
      aria-hidden
      data-testid="screensaver"
    >
      {kind === 'clock' && <DriftingClock />}
      {kind === 'drift' && <CanvasSaver mode="drift" />}
      {kind === 'starfield' && <CanvasSaver mode="starfield" />}
    </div>
  );
}

function DriftingClock() {
  const settings = useSettings();
  const now = useClock(1000);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const s = (t - start) / 1000;
      const x = Math.sin(s / 41) * 12;
      const y = Math.cos(s / 53) * 10;
      el.style.transform = `translate(${x}vw, ${y}vh)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const time = new Intl.DateTimeFormat(settings.region.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !settings.menubar.clock24h,
  }).format(now);
  return (
    <div className="flex h-full items-center justify-center">
      <div
        ref={ref}
        className="mono text-[clamp(64px,14vw,180px)] font-medium text-[#3a3c42] tabular-nums"
      >
        {time}
      </div>
    </div>
  );
}

function CanvasSaver({ mode }: { mode: 'drift' | 'starfield' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const stars = Array.from({ length: mode === 'starfield' ? 240 : 14 }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
      r: Math.random() * Math.PI * 2,
    }));
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (mode === 'starfield') {
        ctx.fillStyle = '#c9ccd2';
        for (const s of stars) {
          s.z -= 0.0025;
          if (s.z <= 0.01) {
            s.x = Math.random() * 2 - 1;
            s.y = Math.random() * 2 - 1;
            s.z = 1;
          }
          const px = (s.x / s.z) * w * 0.5 + w / 2;
          const py = (s.y / s.z) * h * 0.5 + h / 2;
          const size = (1 - s.z) * 3 * dpr;
          if (px < 0 || px > w || py < 0 || py > h) continue;
          ctx.globalAlpha = 1 - s.z;
          ctx.fillRect(px, py, size, size);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = '#2b2c31';
        ctx.lineWidth = dpr;
        for (const s of stars) {
          s.r += 0.0015;
          const cx = w / 2 + Math.cos(s.r) * w * 0.35 * s.z;
          const cy = h / 2 + Math.sin(s.r * 1.3) * h * 0.35 * s.z;
          const size = (60 + s.z * 220) * dpr;
          ctx.beginPath();
          ctx.rect(cx - size / 2, cy - size / 2, size, size);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mode]);
  return <canvas ref={ref} className="h-full w-full" />;
}

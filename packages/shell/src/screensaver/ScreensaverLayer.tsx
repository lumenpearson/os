import { useSessionStore } from '@lumen/kernel';
import { useClock, useRuntimeSettings } from '@lumen/kernel/react';
import { useEffect, useRef } from 'react';

type CanvasMode = 'drift' | 'starfield' | 'contour' | 'rings';

/** Idle screensaver. Any input dismisses it; the session store decides when it shows. */
export function ScreensaverLayer() {
  const active = useSessionStore((s) => s.screensaverActive);
  const settings = useRuntimeSettings();
  const kind = settings.lock.screensaver;
  const still = settings.appearance.reduceMotion;
  if (!active || kind === 'none') return null;
  return (
    <div
      className="fixed inset-0 z-[2100] bg-black select-none"
      aria-hidden
      data-testid="screensaver"
      data-saver={kind}
    >
      {kind === 'clock' ? (
        <DriftingClock still={still} />
      ) : (
        <CanvasSaver mode={kind} still={still} />
      )}
    </div>
  );
}

function DriftingClock({ still }: { still: boolean }) {
  const settings = useRuntimeSettings();
  const now = useClock(1000);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || still) return;
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
  }, [still]);
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

/** Hairline grey on black: the savers are lit by the room, not by the screen. */
const LINE = '#2b2c31';
const POINT = '#c9ccd2';

interface Frame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
  /** Milliseconds since the saver started; 0 for the still frame. */
  elapsed: number;
  /**
   * Frames of 60 Hz since the last paint, so a saver that steps its own state
   * moves at the same speed on a 120 Hz display. 0 for the still frame.
   */
  step: number;
}

/**
 * A field of squares turning about the centre. The depth `z` is fixed per
 * square, so each keeps its own radius and size as it goes round.
 */
function drift({ ctx, w, h, dpr, elapsed }: Frame) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = dpr;
  for (let i = 0; i < 14; i++) {
    const z = ((i * 37) % 100) / 100;
    const r = (elapsed / 1000) * 0.09 + i * 0.45;
    const cx = w / 2 + Math.cos(r) * w * 0.35 * z;
    const cy = h / 2 + Math.sin(r * 1.3) * h * 0.35 * z;
    const size = (60 + z * 220) * dpr;
    ctx.beginPath();
    ctx.rect(cx - size / 2, cy - size / 2, size, size);
    ctx.stroke();
  }
}

/** Points falling towards the viewer. `stars` is the only saver with state. */
function starfield(
  { ctx, w, h, dpr, step }: Frame,
  stars: Array<{ x: number; y: number; z: number }>,
) {
  ctx.fillStyle = POINT;
  for (const s of stars) {
    if (step > 0) {
      s.z -= 0.0025 * step;
      if (s.z <= 0.01) {
        s.x = Math.random() * 2 - 1;
        s.y = Math.random() * 2 - 1;
        s.z = 1;
      }
    }
    const px = (s.x / s.z) * w * 0.5 + w / 2;
    const py = (s.y / s.z) * h * 0.5 + h / 2;
    const size = (1 - s.z) * 3 * dpr;
    if (px < 0 || px > w || py < 0 || py > h) continue;
    ctx.globalAlpha = 1 - s.z;
    ctx.fillRect(px, py, size, size);
  }
  ctx.globalAlpha = 1;
}

/**
 * Contour lines over the same ground, read again and again: each line eases
 * between two shapes on its own phase, so the field never repeats to the eye.
 */
function contour({ ctx, w, h, dpr, elapsed }: Frame) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = dpr;
  const lines = 9;
  const amplitude = h * 0.05;
  for (let i = 0; i < lines; i++) {
    const y = ((i + 0.5) / lines) * h;
    const phase = elapsed / 9000 + i * 0.7;
    const a = Math.sin(phase) * amplitude;
    const b = Math.cos(phase * 0.8) * amplitude;
    ctx.beginPath();
    ctx.moveTo(-0.1 * w, y);
    ctx.bezierCurveTo(0.25 * w, y - a, 0.45 * w, y + b, 0.6 * w, y);
    ctx.bezierCurveTo(0.75 * w, y - b, 0.9 * w, y + a, 1.1 * w, y);
    ctx.stroke();
  }
}

/** Circles opening from the middle, fading as they go, evenly spaced in time. */
function rings({ ctx, w, h, dpr, elapsed }: Frame) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = dpr;
  const count = 6;
  const largest = Math.hypot(w, h) / 2;
  for (let i = 0; i < count; i++) {
    const t = (((elapsed / 14000 + i / count) % 1) + 1) % 1;
    ctx.globalAlpha = Math.min(1, t * 5) * (1 - t);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, t * largest, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function CanvasSaver({ mode, still }: { mode: CanvasMode; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const start = performance.now();
    const stars = Array.from({ length: 240 }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
    }));
    let last = 0;
    const paint = (elapsed: number) => {
      const step = elapsed > 0 ? Math.min(4, (elapsed - last) / 16.7) : 0;
      last = elapsed;
      const frame: Frame = { ctx, w: canvas.width, h: canvas.height, dpr, elapsed, step };
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, frame.w, frame.h);
      if (mode === 'starfield') starfield(frame, stars);
      else if (mode === 'contour') contour(frame);
      else if (mode === 'rings') rings(frame);
      else drift(frame);
    };
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      // The new buffer comes up blank, so a still saver has to draw again.
      if (still) paint(0);
    };
    resize();
    window.addEventListener('resize', resize);
    if (!still) {
      const draw = (t: number) => {
        paint(t - start);
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mode, still]);
  return <canvas ref={ref} className="h-full w-full" />;
}

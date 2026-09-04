// deslop-ignore-file 19 24 — OS cursor shapes must be hand-drawn SVG (no icon set ships
// them), and the round ones — the trail dots and the wait ring — are genuinely circular.
import { useSettings } from '@lumen/kernel/react';
import { useEffect, useRef } from 'react';

type Shape =
  | 'arrow'
  | 'pointer'
  | 'text'
  | 'grab'
  | 'grabbing'
  | 'ew'
  | 'ns'
  | 'nesw'
  | 'nwse'
  | 'move'
  | 'not-allowed'
  | 'wait'
  | 'crosshair'
  | 'none';

const CURSOR_TO_SHAPE: Record<string, Shape> = {
  auto: 'arrow',
  default: 'arrow',
  pointer: 'pointer',
  text: 'text',
  'vertical-text': 'text',
  grab: 'grab',
  grabbing: 'grabbing',
  'col-resize': 'ew',
  'e-resize': 'ew',
  'w-resize': 'ew',
  'ew-resize': 'ew',
  'row-resize': 'ns',
  'n-resize': 'ns',
  's-resize': 'ns',
  'ns-resize': 'ns',
  'ne-resize': 'nesw',
  'sw-resize': 'nesw',
  'nesw-resize': 'nesw',
  'nw-resize': 'nwse',
  'se-resize': 'nwse',
  'nwse-resize': 'nwse',
  move: 'move',
  'all-scroll': 'move',
  'not-allowed': 'not-allowed',
  wait: 'wait',
  progress: 'wait',
  crosshair: 'crosshair',
  none: 'none',
};

/**
 * The OS cursor. The native cursor is hidden through `[data-lumen-cursor=custom]`
 * (set by the kernel from Settings → Cursor); this layer draws an SVG that
 * follows the pointer inside requestAnimationFrame and changes shape from the
 * element under it. It steps aside over iframes and when the pointer leaves.
 */
export function CursorLayer() {
  const settings = useSettings();
  const enabled = settings.cursor.style !== 'native';
  const style = settings.cursor.style;
  const color = settings.cursor.color;
  const trail = settings.cursor.trail;
  const ref = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    let x = -100;
    let y = -100;
    let shape: Shape = 'arrow';
    let raf = 0;
    let visible = false;
    let pressed = false;
    const history: Array<{ x: number; y: number }> = [];

    const apply = () => {
      raf = 0;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      el.dataset.shape = shape;
      el.dataset.pressed = pressed ? 'true' : 'false';
      el.style.opacity = visible ? '1' : '0';
      if (trail) {
        history.unshift({ x, y });
        history.length = Math.min(history.length, 6);
        trailRefs.current.forEach((t, i) => {
          const p = history[i + 1];
          if (!t) return;
          if (!p || !visible) {
            t.style.opacity = '0';
            return;
          }
          t.style.opacity = String(0.35 - i * 0.06);
          t.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        });
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const shapeFor = (target: Element | null): Shape => {
      let node: Element | null = target;
      while (node && node !== document.body) {
        const hinted = (node as HTMLElement).dataset?.cursor;
        if (hinted) return CURSOR_TO_SHAPE[hinted] ?? 'arrow';
        node = node.parentElement;
      }
      if (!target) return 'arrow';
      const computed = getComputedStyle(target).cursor;
      if (computed && computed !== 'none') return CURSOR_TO_SHAPE[computed] ?? 'arrow';
      return 'arrow';
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      visible = true;
      const t = e.target as Element | null;
      if (t?.tagName === 'IFRAME' || t?.tagName === 'VIDEO') visible = false;
      shape = shapeFor(t);
      schedule();
    };
    const onDown = (e: PointerEvent) => {
      pressed = true;
      x = e.clientX;
      y = e.clientY;
      schedule();
    };
    const onUp = () => {
      pressed = false;
      schedule();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.relatedTarget === null) {
        visible = false;
        schedule();
      }
    };
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.tagName === 'IFRAME' || t?.tagName === 'VIDEO') {
        visible = false;
        schedule();
      }
    };
    const onBlur = () => {
      visible = false;
      schedule();
    };
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    document.addEventListener('pointermove', onMove, opts);
    document.addEventListener('pointerdown', onDown, opts);
    document.addEventListener('pointerup', onUp, opts);
    document.addEventListener('pointerover', onOver, opts);
    document.addEventListener('pointerout', onLeave, opts);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointermove', onMove, opts);
      document.removeEventListener('pointerdown', onDown, opts);
      document.removeEventListener('pointerup', onUp, opts);
      document.removeEventListener('pointerover', onOver, opts);
      document.removeEventListener('pointerout', onLeave, opts);
      window.removeEventListener('blur', onBlur);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, trail]);

  if (!enabled) return null;
  const light = color === 'light' || (color === 'auto' && false);
  const fill = light ? '#ffffff' : '#141517';
  const stroke = light ? '#141517' : '#ffffff';

  return (
    <>
      {trail &&
        Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              trailRefs.current[i] = el;
            }}
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[2999] size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
            style={{ background: fill, willChange: 'transform' }}
          />
        ))}
      <div
        ref={ref}
        aria-hidden
        data-testid="os-cursor"
        className="pointer-events-none fixed left-0 top-0 z-[3000] opacity-0 [&_svg]:block"
        style={{
          width: 'var(--lumen-cursor-size)',
          height: 'var(--lumen-cursor-size)',
          willChange: 'transform',
          transition: 'opacity 80ms linear',
        }}
      >
        <CursorGlyphs fill={fill} stroke={stroke} classic={style === 'classic'} />
      </div>
    </>
  );
}

/** All shapes rendered once; CSS shows the one matching data-shape. */
function CursorGlyphs({
  fill,
  stroke,
  classic,
}: {
  fill: string;
  stroke: string;
  classic: boolean;
}) {
  const common = {
    fill,
    stroke,
    strokeWidth: 1.5,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return (
    <>
      <style>{`
        [data-testid='os-cursor'] svg { display: none; width: 100%; height: 100%; overflow: visible; }
        [data-testid='os-cursor'][data-shape='arrow'] svg[data-g='arrow'],
        [data-testid='os-cursor'][data-shape='pointer'] svg[data-g='pointer'],
        [data-testid='os-cursor'][data-shape='text'] svg[data-g='text'],
        [data-testid='os-cursor'][data-shape='grab'] svg[data-g='grab'],
        [data-testid='os-cursor'][data-shape='grabbing'] svg[data-g='grabbing'],
        [data-testid='os-cursor'][data-shape='ew'] svg[data-g='ew'],
        [data-testid='os-cursor'][data-shape='ns'] svg[data-g='ns'],
        [data-testid='os-cursor'][data-shape='nesw'] svg[data-g='nesw'],
        [data-testid='os-cursor'][data-shape='nwse'] svg[data-g='nwse'],
        [data-testid='os-cursor'][data-shape='move'] svg[data-g='move'],
        [data-testid='os-cursor'][data-shape='not-allowed'] svg[data-g='not-allowed'],
        [data-testid='os-cursor'][data-shape='wait'] svg[data-g='wait'],
        [data-testid='os-cursor'][data-shape='crosshair'] svg[data-g='crosshair'] { display: block; }
        [data-testid='os-cursor'][data-shape='none'] { opacity: 0 !important; }
        [data-testid='os-cursor'][data-pressed='true'] svg[data-g='arrow'] { transform: scale(0.92); transform-origin: 2px 2px; }
        [data-testid='os-cursor'] svg[data-g='text'], [data-testid='os-cursor'] svg[data-g='ew'], [data-testid='os-cursor'] svg[data-g='ns'],
        [data-testid='os-cursor'] svg[data-g='nesw'], [data-testid='os-cursor'] svg[data-g='nwse'], [data-testid='os-cursor'] svg[data-g='move'],
        [data-testid='os-cursor'] svg[data-g='grab'], [data-testid='os-cursor'] svg[data-g='grabbing'], [data-testid='os-cursor'] svg[data-g='not-allowed'],
        [data-testid='os-cursor'] svg[data-g='wait'], [data-testid='os-cursor'] svg[data-g='crosshair'] { transform: translate(-50%, -50%); }
      `}</style>
      <svg data-g="arrow" viewBox="0 0 24 24">
        {classic ? (
          <path d="M3 2l0 17 4.5-4.2 3 6.7 3.2-1.4-3-6.6 6.3-.4z" {...common} />
        ) : (
          <path
            d="M4 2.5v16.8l4.2-3.9 2.8 6.3c.2.5.8.7 1.3.5l1.9-.8c.5-.2.7-.8.5-1.3l-2.8-6.3 5.7-.5z"
            {...common}
          />
        )}
      </svg>
      <svg data-g="pointer" viewBox="0 0 24 24">
        <path
          d="M9 3.5a1.5 1.5 0 0 1 3 0V11l1-.3a1.4 1.4 0 0 1 1.9 1l.2.5.5-.2a1.4 1.4 0 0 1 1.9.9l.1.4.5-.1a1.5 1.5 0 0 1 1.8 1.4l-.3 3.5a4 4 0 0 1-1.4 2.7l-1.4 1.2a4 4 0 0 1-2.6 1H12a4 4 0 0 1-3.4-1.9l-3.4-5.5a1.4 1.4 0 0 1 2.2-1.7L9 15z"
          {...common}
        />
      </svg>
      <svg data-g="text" viewBox="0 0 24 24">
        <path
          d="M9 3h2.5q.5 0 .5.5V20.5q0 .5-.5.5H9M15 3h-2.5q-.5 0-.5.5V20.5q0 .5.5.5H15M12 7v10"
          fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M9 3h2.5q.5 0 .5.5V20.5q0 .5-.5.5H9M15 3h-2.5q-.5 0-.5.5V20.5q0 .5.5.5H15"
          fill="none"
          stroke={fill}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <svg data-g="grab" viewBox="0 0 24 24">
        <path
          d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11m0-6a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V12m0-2a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.4-4.2a1.5 1.5 0 0 1 2.6-1.5L8 13"
          {...common}
        />
      </svg>
      <svg data-g="grabbing" viewBox="0 0 24 24">
        <path
          d="M8 12v-2a1.5 1.5 0 0 1 3 0v2m0-2a1.5 1.5 0 0 1 3 0v2m0-1.5a1.5 1.5 0 0 1 3 0V12m0 0a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-1.6-2.8a1.5 1.5 0 0 1 2.6-1.5L8 14"
          {...common}
        />
      </svg>
      <svg data-g="ew" viewBox="0 0 24 24">
        <path
          d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"
          {...common}
          fill="none"
          strokeWidth="3.5"
          stroke={stroke}
        />
        <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" {...common} fill="none" />
      </svg>
      <svg data-g="ns" viewBox="0 0 24 24">
        <path
          d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"
          {...common}
          fill="none"
          strokeWidth="3.5"
          stroke={stroke}
        />
        <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" {...common} fill="none" />
      </svg>
      <svg data-g="nesw" viewBox="0 0 24 24">
        <path
          d="M5 19L19 5M9 19H5v-4M15 5h4v4"
          {...common}
          fill="none"
          strokeWidth="3.5"
          stroke={stroke}
        />
        <path d="M5 19L19 5M9 19H5v-4M15 5h4v4" {...common} fill="none" />
      </svg>
      <svg data-g="nwse" viewBox="0 0 24 24">
        <path
          d="M5 5l14 14M5 9V5h4M19 15v4h-4"
          {...common}
          fill="none"
          strokeWidth="3.5"
          stroke={stroke}
        />
        <path d="M5 5l14 14M5 9V5h4M19 15v4h-4" {...common} fill="none" />
      </svg>
      <svg data-g="move" viewBox="0 0 24 24">
        <path
          d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"
          {...common}
          fill="none"
          strokeWidth="3.5"
          stroke={stroke}
        />
        <path
          d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"
          {...common}
          fill="none"
        />
      </svg>
      <svg data-g="not-allowed" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" {...common} fill="none" strokeWidth="3.5" stroke={stroke} />
        <circle cx="12" cy="12" r="8" {...common} fill="none" />
        <path d="M6.5 6.5l11 11" {...common} fill="none" />
      </svg>
      <svg data-g="wait" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="none" stroke={stroke} strokeWidth="3.5" />
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke={fill}
          strokeWidth="1.5"
          strokeOpacity="0.3"
        />
        {/*
          The arc must turn around the viewBox centre, not its own bounding
          box, or it orbits instead of spinning. transform-box: view-box makes
          transform-origin resolve against the 24×24 coordinate system.
        */}
        <path
          d="M12 4a8 8 0 0 1 8 8"
          fill="none"
          stroke={fill}
          strokeWidth="1.5"
          strokeLinecap="round"
          className="lumen-spin"
          style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
        />
      </svg>
      <svg data-g="crosshair" viewBox="0 0 24 24">
        <path d="M12 2v20M2 12h20" fill="none" stroke={stroke} strokeWidth="3.5" />
        <path d="M12 2v20M2 12h20" fill="none" stroke={fill} strokeWidth="1.5" />
      </svg>
    </>
  );
}

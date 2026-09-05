import { useRegistryStore, useWindowStore } from '@lumen/kernel';
import { useWindows, useWorkArea } from '@lumen/kernel/react';
import { cx, useEscape } from '@lumen/ui';
import { useEffect, useMemo, useRef } from 'react';
import { useShellStore } from '../shellStore';

/**
 * Mission Control: every open window laid out in a grid, scaled down, live.
 * Real window elements are transformed into place through CSS variables,
 * so the previews are the windows themselves.
 */
export function MissionControl() {
  const open = useShellStore((s) => s.missionControl);
  const toggle = useShellStore((s) => s.toggle);
  const windows = useWindows();
  const area = useWorkArea();
  const apps = useRegistryStore((s) => s.apps);
  useEscape(() => toggle('missionControl', false), open);

  const layout = useMemo(() => {
    const list = windows.filter((w) => !w.minimized);
    if (list.length === 0) return [];
    const cols = Math.ceil(Math.sqrt(list.length * (area.width / Math.max(1, area.height))));
    const rows = Math.ceil(list.length / cols);
    const pad = 24;
    const cellW = (area.width - pad * (cols + 1)) / cols;
    const cellH = (area.height - 40 - pad * (rows + 1)) / rows;
    return list.map((w, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const scale = Math.min(cellW / w.bounds.width, cellH / w.bounds.height, 0.9);
      const width = w.bounds.width * scale;
      const height = w.bounds.height * scale;
      const x = area.x + pad + col * (cellW + pad) + (cellW - width) / 2;
      const y = area.y + pad + row * (cellH + pad) + (cellH - height) / 2;
      return { id: w.id, title: w.title, appId: w.appId, x, y, scale, width, height };
    });
  }, [windows, area]);

  /**
   * Whether the overlay was open on the previous run, so the effect can tell a
   * genuine close from the many times it re-runs for unrelated reasons.
   */
  const wasOpen = useRef(false);

  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    // While Mission Control is shut this effect still re-runs on every window
    // change — a move, a resize, a focus, an open. It must not touch the frames
    // then: writing an inline transform and a 260ms transition onto every
    // window makes dragging trail the pointer, and the inline `transition`
    // shorthand overrides the frame's own transition classes so windows stop
    // animating as they open and close.
    if (!open && !closing) return;

    const root = document.querySelector<HTMLElement>('[data-testid="window-layer"]');
    if (!root) return;
    for (const w of windows) {
      const el = root.querySelector<HTMLElement>(`[data-window-id="${w.id}"]`);
      if (!el) continue;
      const item = layout.find((l) => l.id === w.id);
      if (open && item) {
        el.style.transition = 'transform var(--duration-slow) var(--ease-standard)';
        el.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) scale(${item.scale})`;
        el.style.transformOrigin = 'top left';
        el.style.pointerEvents = 'none';
        continue;
      }
      // Closing: ease back to the real bounds, then hand every property we
      // touched back to React's style prop rather than leaving ours behind.
      el.style.transition = 'transform var(--duration-slow) var(--ease-standard)';
      el.style.transform = `translate3d(${w.bounds.x}px, ${w.bounds.y}px, 0)`;
      el.style.pointerEvents = '';
      const done = () => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    }
  }, [open, layout, windows]);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-[1300] bg-scrim lumen-fade-enter"
      data-testid="mission-control"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) toggle('missionControl', false);
      }}
    >
      {layout.length === 0 && (
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-md text-white/80">
          No open windows
        </p>
      )}
      {layout.map((item) => {
        const Icon = apps[item.appId]?.icon;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={`Switch to ${item.title}`}
            onClick={() => {
              toggle('missionControl', false);
              useWindowStore.getState().focus(item.id);
            }}
            className={cx(
              'absolute rounded-lg outline-none ring-accent focus-visible:ring-2 hover:ring-2 hover:ring-white/60',
            )}
            style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
          >
            {/* deslop-ignore-next-line 19 — a scrim behind the window title, which floats over live window content. */}
            <span className="absolute -bottom-7 left-1/2 flex max-w-full -translate-x-1/2 items-center gap-1.5 rounded-sm bg-black/50 px-2 py-0.5 text-sm text-white">
              {Icon && <Icon size={14} />}
              <span className="truncate-1">{item.title}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

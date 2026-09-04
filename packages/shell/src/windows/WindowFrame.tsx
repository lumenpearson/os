import { AppHost, FileTypeIcon } from '@lumen/apps';
import {
  getSettings,
  keepTitleVisible,
  type Rect,
  type ResizeHandle,
  resizeRect,
  snapRect,
  snapZoneAt,
  useProcessStore,
  useRegistryStore,
  useWindowStore,
  type WindowId,
} from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useShellStore } from '../shellStore';
import { useSnapPreview } from './SnapPreview';
import { WindowControls } from './WindowControls';

const HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};
const HANDLE_CLASS: Record<ResizeHandle, string> = {
  n: 'top-0 left-3 right-3 h-1.5 -translate-y-1',
  s: 'bottom-0 left-3 right-3 h-1.5 translate-y-1',
  e: 'right-0 top-3 bottom-3 w-1.5 translate-x-1',
  w: 'left-0 top-3 bottom-3 w-1.5 -translate-x-1',
  ne: 'top-0 right-0 size-3 -translate-y-1 translate-x-1',
  nw: 'top-0 left-0 size-3 -translate-y-1 -translate-x-1',
  se: 'bottom-0 right-0 size-3 translate-y-1 translate-x-1',
  sw: 'bottom-0 left-0 size-3 translate-y-1 -translate-x-1',
};

/**
 * One window: chrome, drag, resize, snap, animations, and the app inside.
 * Pointer-rate updates write transforms through refs; the store is updated
 * once when the gesture ends.
 */
export const WindowFrame = memo(function WindowFrame({ id }: { id: WindowId }) {
  const kernel = useKernel();
  const win = useWindowStore((s) => s.windows[id]);
  const focused = useWindowStore((s) => s.focusedId === id);
  const app = useRegistryStore((s) => (win ? s.apps[win.appId] : undefined));
  const process = useProcessStore((s) => (win ? s.processes[win.pid] : undefined));
  const shadows = getSettings().display.shadows;
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [minimizing, setMinimizing] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = useCallback(async () => {
    if (!win) return;
    const guard = await kernel.closeWindow(id);
    if (guard === false) return;
  }, [kernel, id, win]);

  const animateThen = (kind: 'close' | 'minimize', after: () => void) => {
    if (kind === 'close') setClosing(true);
    else setMinimizing(true);
    const duration =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--duration-window'),
      ) || 0;
    setTimeout(after, duration);
  };

  // ── drag ──────────────────────────────────────────────────────────────
  const onTitlePointerDown = (e: React.PointerEvent) => {
    if (!win || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [data-no-drag]')) return;
    if (win.fullscreen) return;
    e.preventDefault();
    useWindowStore.getState().focus(id);
    const el = frameRef.current;
    if (!el) return;
    const store = useWindowStore.getState();
    const settings = getSettings();
    const start = { x: e.clientX, y: e.clientY };
    let bounds: Rect = { ...win.bounds };
    // dragging a maximized/snapped window restores it under the pointer
    if (win.maximized || win.snap) {
      const restore = win.restoreBounds ?? {
        ...win.bounds,
        width: Math.min(win.bounds.width, 900),
        height: Math.min(win.bounds.height, 600),
      };
      const ratio = (e.clientX - win.bounds.x) / win.bounds.width;
      bounds = { ...restore, x: Math.round(e.clientX - restore.width * ratio), y: win.bounds.y };
      if (win.maximized) store.toggleMaximize(id);
      else store.snap(id, null);
      store.setBounds(id, bounds);
    }
    let latest = bounds;
    let raf = 0;
    let moved = false;
    useShellStore.getState().setInteracting(true);
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      latest = keepTitleVisible({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, store.area);
      if (settings.display.snapping) {
        const zone = snapZoneAt(ev.clientX, ev.clientY, store.area);
        useSnapPreview
          .getState()
          .set(zone ? (zone === 'top' ? store.area : snapRect(zone, store.area)) : null);
      }
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;
        });
      }
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      useShellStore.getState().setInteracting(false);
      useSnapPreview.getState().set(null);
      if (!moved) return;
      const zone = settings.display.snapping
        ? snapZoneAt(ev.clientX, ev.clientY, store.area)
        : null;
      if (zone) {
        store.setBounds(id, latest);
        store.snap(id, zone);
      } else {
        store.setBounds(id, latest);
      }
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  // ── resize ────────────────────────────────────────────────────────────
  const onHandlePointerDown = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    if (
      !win ||
      e.button !== 0 ||
      win.options.resizable === false ||
      win.maximized ||
      win.fullscreen
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    useWindowStore.getState().focus(id);
    const el = frameRef.current;
    if (!el) return;
    const store = useWindowStore.getState();
    const start = { x: e.clientX, y: e.clientY };
    const bounds = { ...win.bounds };
    const min = { width: win.options.minWidth ?? 320, height: win.options.minHeight ?? 200 };
    const max = { width: win.options.maxWidth, height: win.options.maxHeight };
    let latest = bounds;
    let raf = 0;
    useShellStore.getState().setInteracting(true);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      latest = resizeRect(bounds, handle, ev.clientX - start.x, ev.clientY - start.y, min, max);
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;
          el.style.width = `${latest.width}px`;
          el.style.height = `${latest.height}px`;
        });
      }
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      useShellStore.getState().setInteracting(false);
      if (win.snap) store.snap(id, null);
      store.setBounds(id, latest);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  if (!win || !app) return null;

  const { bounds } = win;
  const titleBar = win.options.titleBar ?? 'default';
  const fullscreen = win.fullscreen;
  const style: React.CSSProperties = fullscreen
    ? { transform: 'translate3d(0,0,0)', width: '100%', height: '100%', zIndex: 950 }
    : {
        transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
        width: bounds.width,
        height: bounds.height,
        zIndex: win.zIndex,
      };

  const Icon = app.icon;
  const showChrome = titleBar !== 'hidden' && !fullscreen;

  return (
    <section
      ref={frameRef}
      role="dialog"
      aria-label={win.title || app.name}
      data-window-id={id}
      data-app-id={win.appId}
      data-focused={focused}
      data-testid="window"
      tabIndex={-1}
      onPointerDownCapture={() => {
        if (!focused) useWindowStore.getState().focus(id);
      }}
      className={cx(
        'absolute left-0 top-0 flex flex-col overflow-hidden bg-surface text-ink outline-none will-change-transform',
        fullscreen ? 'rounded-none' : 'rounded-lg border border-rule',
        !fullscreen && shadows && (focused ? 'shadow-window-active' : 'shadow-window'),
        win.minimized || minimizing ? 'pointer-events-none' : '',
        'transition-[opacity,scale,box-shadow] duration-(--duration-window) ease-(--ease-spring)',
        !mounted && 'opacity-0 scale-[0.96]',
        (closing || win.minimized || minimizing) && 'opacity-0 scale-[0.94]',
        win.minimized && 'invisible',
      )}
      style={style}
    >
      {showChrome && (
        <header
          className={cx(
            'relative flex shrink-0 items-center select-none',
            titleBar === 'default'
              ? 'h-(--lumen-window-titlebar-h) border-b border-rule bg-canvas'
              : 'pointer-events-none absolute left-0 top-0 z-10 h-(--lumen-window-titlebar-h) w-full',
          )}
          data-testid="window-titlebar"
          onPointerDown={onTitlePointerDown}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            if (win.options.maximizable !== false) useWindowStore.getState().toggleMaximize(id);
          }}
        >
          <div
            className={cx(
              'flex items-center pl-2',
              titleBar === 'inset' && 'pointer-events-auto h-full',
            )}
          >
            <WindowControls
              focused={focused}
              closable={win.options.closable !== false}
              minimizable={win.options.minimizable !== false}
              maximizable={win.options.maximizable !== false}
              dirty={win.dirty}
              onClose={() =>
                animateThen('close', () => void requestClose().then(() => setClosing(false)))
              }
              onMinimize={() =>
                animateThen('minimize', () => {
                  useWindowStore.getState().minimize(id);
                  setMinimizing(false);
                })
              }
              onMaximize={() => useWindowStore.getState().toggleMaximize(id)}
            />
          </div>
          {titleBar === 'default' && (
            <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 px-20">
              {win.documentPath ? (
                <FileTypeIcon entry={{ kind: 'file', path: win.documentPath }} size={14} />
              ) : (
                win.options.showIcon !== false && <Icon size={14} />
              )}
              <span
                className={cx(
                  'truncate-1 text-base font-medium',
                  focused ? 'text-ink' : 'text-ink-3',
                )}
              >
                {win.title || app.name}
              </span>
            </div>
          )}
        </header>
      )}
      <div
        ref={(el) => {
          bodyRef.current = el;
          if (el !== container) setContainer(el);
        }}
        className={cx('relative min-h-0 flex-1', !focused && 'lumen-window-inactive')}
        data-testid="window-body"
      >
        {process && (
          <AppHost
            app={app}
            pid={win.pid}
            windowId={id}
            args={process.args}
            container={container}
          />
        )}
      </div>
      {!fullscreen &&
        !win.maximized &&
        win.options.resizable !== false &&
        HANDLES.map((h) => (
          <div
            key={h}
            aria-hidden
            data-cursor={HANDLE_CURSOR[h]}
            onPointerDown={onHandlePointerDown(h)}
            className={cx('absolute z-20', HANDLE_CLASS[h])}
            style={{ cursor: HANDLE_CURSOR[h] }}
          />
        ))}
    </section>
  );
});

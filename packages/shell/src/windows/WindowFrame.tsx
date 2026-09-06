import { AppHost, FileTypeIcon } from '@lumen/apps';
import {
  formatShortcut,
  GLOBAL_SHORTCUTS,
  type GlobalShortcutId,
  getSettings,
  keepTitleVisible,
  type Rect,
  type ResizeHandle,
  resizeRect,
  runtimeSettings,
  type SnapSide,
  snapRect,
  snapZoneAt,
  useProcessStore,
  useRegistryStore,
  useWindowStore,
  type WindowId,
} from '@lumen/kernel';
import { useKernel, useRuntimeSettings } from '@lumen/kernel/react';
import { AnchoredMenu, cx, isContextMenuKey, useContextMenu } from '@lumen/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useShellStore } from '../shellStore';
import { isDragSurface, titleBarHeight } from './drag';
import { useSnapPreview } from './SnapPreview';
import { approach, settled } from './smoothing';
import { WindowControls } from './WindowControls';
import { windowMenuItems } from './windowMenu';

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
  // The window in front only looks like it while the keyboard can reach it.
  const inFront = useWindowStore((s) => s.focusedId === id);
  const hostFocused = useShellStore((s) => s.hostFocused);
  const focused = inFront && hostFocused;
  const app = useRegistryStore((s) => (win ? s.apps[win.appId] : undefined));
  const process = useProcessStore((s) => (win ? s.processes[win.pid] : undefined));
  // Subscribed, not sampled: Settings > Windows changes what a full-screen
  // window covers and whether it keeps its title bar, and a switch that only
  // takes effect the next time something else re-rendered the frame is a
  // switch the person cannot trust.
  const settings = useRuntimeSettings();
  const area = useWindowStore((s) => s.area);
  const shadows = settings.display.shadows;
  const frameRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleMenu = useContextMenu();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  /**
   * Stable, and it has to be: React detaches and re-attaches a ref callback
   * whose identity changed, which for an inline one is every render. The
   * detach passes null, so the window body — which is where every dialog in
   * the app is portalled — was thrown away and rebuilt on each render, and
   * the kernel's two-second load tick renders this component. That is what
   * made open dialogs blink.
   */
  const setBody = useCallback((el: HTMLDivElement | null) => {
    bodyRef.current = el;
    setContainer(el);
  }, []);
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

  const closeWindow = () =>
    animateThen('close', () => void requestClose().then(() => setClosing(false)));
  const minimizeWindow = () =>
    animateThen('minimize', () => {
      useWindowStore.getState().minimize(id);
      setMinimizing(false);
    });

  /**
   * Whether an event landed on the title bar rather than on the app. The same
   * question the drag asks, answered the same way, so the menu appears on
   * exactly the strip that a person can drag the window by — including the
   * inset bar, where the app draws its own toolbar in the same place.
   */
  const onTitleBar = (target: EventTarget | null, clientY: number) => {
    const frame = frameRef.current;
    return isDragSurface({
      offsetY: clientY - (frame?.getBoundingClientRect().top ?? 0),
      titleBarHeight: titleBarHeight(frame),
      target: target instanceof Element ? target : null,
      frame,
    });
  };

  // ── drag ──────────────────────────────────────────────────────────────
  const onTitlePointerDown = (e: React.PointerEvent) => {
    if (!win || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (win.fullscreen) return;
    const frame = frameRef.current;
    if (
      !isDragSurface({
        offsetY: e.clientY - (frame?.getBoundingClientRect().top ?? 0),
        titleBarHeight: titleBarHeight(frame),
        target,
        frame,
      })
    )
      return;
    e.preventDefault();
    useWindowStore.getState().focus(id);
    const el = frameRef.current;
    if (!el) return;
    const store = useWindowStore.getState();
    // The drag reads settings imperatively, so it has to apply Low Power
    // Mode itself; the component's copy went through the hook.
    const settings = runtimeSettings(getSettings());
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
    /**
     * The zone the preview is currently showing. `undefined` until the first
     * move, so the drag always states its zone once — including "no zone".
     * The rect follows from the zone alone: the work area and the tiling gap
     * are both fixed for the length of the drag, and `snapRect` reads nothing
     * else, so re-setting it on every move only re-renders the preview.
     */
    let shownZone: SnapSide | null | undefined;
    /**
     * Off, the window is pinned to the pointer and one frame paints wherever
     * the hand is. On, the frame keeps chasing after the hand stops, so the
     * loop re-arms itself until it arrives.
     */
    const smooth =
      settings.animation.windowMove &&
      !settings.appearance.reduceMotion &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shown = { x: bounds.x, y: bounds.y };
    let lastFrame = 0;
    const paint = (x: number, y: number) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const tick = (now: number) => {
      raf = 0;
      if (!smooth) {
        paint(latest.x, latest.y);
        return;
      }
      const dt = lastFrame ? Math.min(now - lastFrame, 64) : 16;
      lastFrame = now;
      shown.x = approach(shown.x, latest.x, dt);
      shown.y = approach(shown.y, latest.y, dt);
      paint(shown.x, shown.y);
      if (!settled(shown, latest)) raf = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
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
        if (zone !== shownZone) {
          shownZone = zone;
          useSnapPreview
            .getState()
            .set(
              zone
                ? zone === 'top'
                  ? store.area
                  : snapRect(zone, store.area, settings.windows.tilingGap)
                : null,
            );
        }
      }
      schedule();
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      useShellStore.getState().setInteracting(false);
      useSnapPreview.getState().set(null);
      if (!moved) return;
      // The chase is over the moment the hand lets go: the window belongs at
      // the position the pointer chose, not part of the way there.
      paint(latest.x, latest.y);
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

  const onTitleDoubleClick = (e: React.MouseEvent) => {
    if (!win || win.options.maximizable === false) return;
    const frame = frameRef.current;
    if (
      !isDragSurface({
        offsetY: e.clientY - (frame?.getBoundingClientRect().top ?? 0),
        titleBarHeight: titleBarHeight(frame),
        target: e.target as HTMLElement,
        frame,
      })
    )
      return;
    useWindowStore.getState().toggleMaximize(id);
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
  /**
   * Full screen covers the whole display, or stops at the work area and
   * leaves the menubar and the taskbar where they are — Settings > Windows.
   * The layer is the whole viewport either way, so "stops at the panels" is
   * the work area written out rather than 100%.
   */
  const style: React.CSSProperties = fullscreen
    ? settings.windows.fullscreenCoversPanels
      ? { transform: 'translate3d(0,0,0)', width: '100%', height: '100%', zIndex: 950 }
      : {
          transform: `translate3d(${area.x}px, ${area.y}px, 0)`,
          width: area.width,
          height: area.height,
          zIndex: 950,
        }
    : {
        transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
        width: bounds.width,
        height: bounds.height,
        zIndex: win.zIndex,
      };

  const Icon = app.icon;
  // macOS hides the title bar in full screen and gives it back on approach;
  // someone who would rather keep the traffic lights turns that off.
  const showChrome =
    titleBar !== 'hidden' && (!fullscreen || !settings.windows.fullscreenHidesTitleBar);

  const shortcutFor = (shortcutId: GlobalShortcutId) =>
    formatShortcut(
      settings.keyboard.shortcuts[shortcutId] ?? GLOBAL_SHORTCUTS[shortcutId].keys,
      settings.keyboard.modifier,
    );

  const menuItems = windowMenuItems(
    {
      minimizable: win.options.minimizable !== false,
      maximizable: win.options.maximizable !== false,
      closable: win.options.closable !== false,
      snapping: settings.display.snapping,
      snap: win.snap,
      fullscreen: Boolean(fullscreen),
    },
    {
      minimize: minimizeWindow,
      zoom: () => useWindowStore.getState().toggleMaximize(id),
      snapLeft: () => useWindowStore.getState().snap(id, 'left'),
      snapRight: () => useWindowStore.getState().snap(id, 'right'),
      close: closeWindow,
    },
    shortcutFor,
  );

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
        // inFront, not focused: a click that arrives while the host had lost
        // focus must not re-raise a window that was already in front.
        if (!inFront) useWindowStore.getState().focus(id);
      }}
      // The title bar of an inset window belongs to the app, which draws its
      // own toolbar there, so the frame decides what starts a drag.
      onPointerDown={onTitlePointerDown}
      onDoubleClick={onTitleDoubleClick}
      onContextMenu={(e) => {
        // Something inside drew its own menu — a tab, a toolbar — and one
        // menu is the answer to one click.
        if (e.defaultPrevented) return;
        // Not the title bar: the app below decides, and failing that the
        // session's own rule for a right-click with nothing to offer.
        if (!showChrome || !onTitleBar(e.target, e.clientY)) return;
        titleMenu.openAt(e);
      }}
      onKeyDown={(e) => {
        if (!showChrome || !isContextMenuKey(e)) return;
        // Only when the window itself, or something in its title bar, has the
        // keyboard: anything inside the app answers for its own content.
        const header = headerRef.current;
        const own =
          e.target === e.currentTarget ||
          (e.target instanceof Node && header !== null && header.contains(e.target));
        if (!own) return;
        e.preventDefault();
        const rect = (header ?? e.currentTarget).getBoundingClientRect();
        titleMenu.openAtPoint(rect.left + 12, rect.bottom - 2);
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
          ref={headerRef}
          className={cx(
            // `relative` belongs to the default bar alone, which positions its
            // centred title against it. Leaving it in the shared list made the
            // inset bar relative too: Tailwind orders `.relative` after
            // `.absolute` in the sheet, so the branch below could not win, and
            // every window that asked for an inset bar got a 36px strip of
            // nothing above the app's own toolbar instead.
            'flex shrink-0 items-center select-none',
            titleBar === 'default'
              ? 'relative h-(--lumen-window-titlebar-h) border-b border-rule bg-canvas'
              : 'pointer-events-none absolute left-0 top-0 z-10 h-(--lumen-window-titlebar-h) w-full',
          )}
          data-testid="window-titlebar"
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
              onClose={closeWindow}
              onMinimize={minimizeWindow}
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
        ref={setBody}
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
      <AnchoredMenu
        open={titleMenu.open}
        at={titleMenu.at}
        items={menuItems}
        onClose={titleMenu.close}
      />
    </section>
  );
});

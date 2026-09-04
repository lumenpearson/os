import { create } from 'zustand';
import { events } from '../events';
import type { AppId, Pid, Rect, SnapSide, WindowId, WindowOptions, WindowState } from '../types';
import { clampToArea, initialBounds, rectsEqual, snapRect } from './geometry';

const Z_BASE = 100;

interface WindowStore {
  windows: Record<WindowId, WindowState>;
  order: WindowId[]; // z-order: last = top
  focusedId: WindowId | null;
  /** Work area in CSS px: the desktop minus menubar and taskbar. */
  area: Rect;
  nextZ: number;
  counter: number;

  setArea: (area: Rect) => void;
  open: (pid: Pid, appId: AppId, options: WindowOptions) => WindowState;
  close: (id: WindowId) => void;
  /** Mark closing (animation) without removing. */
  beginClose: (id: WindowId) => void;
  focus: (id: WindowId | null) => void;
  focusNext: (direction?: 1 | -1) => void;
  setBounds: (id: WindowId, bounds: Rect) => void;
  move: (id: WindowId, x: number, y: number) => void;
  setTitle: (id: WindowId, title: string) => void;
  setDirty: (id: WindowId, dirty: boolean) => void;
  setDocument: (id: WindowId, path: string | null) => void;
  minimize: (id: WindowId) => void;
  restore: (id: WindowId) => void;
  toggleMaximize: (id: WindowId) => void;
  setFullscreen: (id: WindowId, value: boolean) => void;
  snap: (id: WindowId, side: SnapSide | null) => void;
  minimizeAll: () => void;
  restoreAll: () => void;
  closeAllForPid: (pid: Pid) => void;
  /** Re-clamp everything after a viewport change. */
  relayout: () => void;
}

let idCounter = 0;
const newId = () => `w${(++idCounter).toString(36)}${Date.now().toString(36).slice(-4)}`;

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: {},
  order: [],
  focusedId: null,
  area: { x: 0, y: 0, width: 1280, height: 720 },
  nextZ: Z_BASE,
  counter: 0,

  setArea: (area) => {
    if (rectsEqual(get().area, area)) return;
    set({ area });
    get().relayout();
  },

  open: (pid, appId, options) => {
    const { area, order, windows, nextZ } = get();
    const visible = order
      .map((id) => windows[id])
      .filter((w): w is WindowState => w !== undefined && !w.minimized);
    const bounds = initialBounds(
      options,
      area,
      visible.map((w) => w.bounds),
    );
    const id = newId();
    const win: WindowState = {
      id,
      pid,
      appId,
      title: options.title ?? '',
      bounds,
      restoreBounds: null,
      minimized: false,
      maximized: false,
      fullscreen: false,
      snap: null,
      zIndex: nextZ,
      options,
      dirty: false,
      documentPath: null,
      createdAt: Date.now(),
      closing: false,
    };
    set((s) => ({
      windows: { ...s.windows, [id]: win },
      order: [...s.order, id],
      focusedId: id,
      nextZ: nextZ + 1,
      counter: s.counter + 1,
    }));
    events.emit('window:open', { windowId: id, pid });
    events.emit('window:focus', { windowId: id });
    return win;
  },

  beginClose: (id) =>
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      return { windows: { ...s.windows, [id]: { ...w, closing: true } } };
    }),

  close: (id) => {
    const w = get().windows[id];
    if (!w) return;
    set((s) => {
      const windows = { ...s.windows };
      delete windows[id];
      const order = s.order.filter((x) => x !== id);
      return { windows, order };
    });
    events.emit('window:close', { windowId: id, pid: w.pid });
    if (get().focusedId === id) {
      const next = [...get().order].reverse().find((x) => !get().windows[x]?.minimized) ?? null;
      get().focus(next);
    }
  },

  focus: (id) => {
    const s = get();
    if (id === null) {
      if (s.focusedId !== null) {
        set({ focusedId: null });
        events.emit('window:focus', { windowId: null });
      }
      return;
    }
    const w = s.windows[id];
    if (!w) return;
    const order = [...s.order.filter((x) => x !== id), id];
    set({
      order,
      focusedId: id,
      nextZ: s.nextZ + 1,
      windows: { ...s.windows, [id]: { ...w, zIndex: s.nextZ, minimized: false } },
    });
    if (s.focusedId !== id) events.emit('window:focus', { windowId: id });
  },

  focusNext: (direction = 1) => {
    const s = get();
    const candidates = s.order.filter((id) => !s.windows[id]?.minimized);
    if (candidates.length === 0) return;
    const idx = s.focusedId ? candidates.indexOf(s.focusedId) : -1;
    const next = candidates[(idx + direction + candidates.length) % candidates.length];
    if (next) s.focus(next);
  },

  setBounds: (id, bounds) =>
    set((s) => {
      const w = s.windows[id];
      if (!w || rectsEqual(w.bounds, bounds)) return s;
      return { windows: { ...s.windows, [id]: { ...w, bounds } } };
    }),

  move: (id, x, y) =>
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      return { windows: { ...s.windows, [id]: { ...w, bounds: { ...w.bounds, x, y } } } };
    }),

  setTitle: (id, title) =>
    set((s) => {
      const w = s.windows[id];
      if (!w || w.title === title) return s;
      return { windows: { ...s.windows, [id]: { ...w, title } } };
    }),

  setDirty: (id, dirty) =>
    set((s) => {
      const w = s.windows[id];
      if (!w || w.dirty === dirty) return s;
      return { windows: { ...s.windows, [id]: { ...w, dirty } } };
    }),

  setDocument: (id, path) =>
    set((s) => {
      const w = s.windows[id];
      if (!w || w.documentPath === path) return s;
      return { windows: { ...s.windows, [id]: { ...w, documentPath: path } } };
    }),

  minimize: (id) => {
    const s = get();
    const w = s.windows[id];
    if (!w) return;
    set({ windows: { ...s.windows, [id]: { ...w, minimized: true } } });
    if (s.focusedId === id) {
      const next = [...s.order].reverse().find((x) => x !== id && !s.windows[x]?.minimized) ?? null;
      get().focus(next);
    }
  },

  restore: (id) => {
    const w = get().windows[id];
    if (!w) return;
    get().focus(id);
  },

  toggleMaximize: (id) => {
    const s = get();
    const w = s.windows[id];
    if (!w || w.options.maximizable === false) return;
    if (w.maximized) {
      const bounds = w.restoreBounds ? clampToArea(w.restoreBounds, s.area) : w.bounds;
      set({
        windows: {
          ...s.windows,
          [id]: { ...w, maximized: false, snap: null, restoreBounds: null, bounds },
        },
      });
    } else {
      set({
        windows: {
          ...s.windows,
          [id]: {
            ...w,
            maximized: true,
            snap: null,
            restoreBounds: w.snap ? w.restoreBounds : w.bounds,
            bounds: { ...s.area },
          },
        },
      });
    }
    get().focus(id);
  },

  setFullscreen: (id, value) =>
    set((s) => {
      const w = s.windows[id];
      if (!w || w.fullscreen === value) return s;
      return { windows: { ...s.windows, [id]: { ...w, fullscreen: value } } };
    }),

  snap: (id, side) => {
    const s = get();
    const w = s.windows[id];
    if (!w) return;
    if (side === null) {
      if (!w.snap) return;
      const bounds = w.restoreBounds ? clampToArea(w.restoreBounds, s.area) : w.bounds;
      set({ windows: { ...s.windows, [id]: { ...w, snap: null, restoreBounds: null, bounds } } });
      return;
    }
    if (side === 'top') {
      get().toggleMaximize(id);
      return;
    }
    set({
      windows: {
        ...s.windows,
        [id]: {
          ...w,
          snap: side,
          maximized: false,
          restoreBounds: w.snap || w.maximized ? w.restoreBounds : w.bounds,
          bounds: snapRect(side, s.area),
        },
      },
    });
  },

  minimizeAll: () =>
    set((s) => {
      const windows: Record<WindowId, WindowState> = {};
      for (const [id, w] of Object.entries(s.windows)) windows[id] = { ...w, minimized: true };
      events.emit('window:focus', { windowId: null });
      return { windows, focusedId: null };
    }),

  restoreAll: () =>
    set((s) => {
      const windows: Record<WindowId, WindowState> = {};
      for (const [id, w] of Object.entries(s.windows)) windows[id] = { ...w, minimized: false };
      return { windows };
    }),

  closeAllForPid: (pid) => {
    for (const w of Object.values(get().windows)) if (w.pid === pid) get().close(w.id);
  },

  relayout: () =>
    set((s) => {
      const windows: Record<WindowId, WindowState> = {};
      for (const [id, w] of Object.entries(s.windows)) {
        if (w.maximized) windows[id] = { ...w, bounds: { ...s.area } };
        else if (w.snap) windows[id] = { ...w, bounds: snapRect(w.snap, s.area) };
        else {
          const min = { width: w.options.minWidth ?? 320, height: w.options.minHeight ?? 200 };
          windows[id] = { ...w, bounds: clampToArea(w.bounds, s.area, min) };
        }
      }
      return { windows };
    }),
}));

export const selectFocusedWindow = (s: WindowStore) =>
  s.focusedId ? s.windows[s.focusedId] : undefined;
export const selectOrderedWindows = (s: WindowStore) =>
  s.order.map((id) => s.windows[id]).filter((w): w is WindowState => Boolean(w));

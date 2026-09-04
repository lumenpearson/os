import { create } from 'zustand';
import type { MenuTemplate, WindowId } from '../types';

interface MenuStore {
  /** Menus contributed by each window; the menubar shows the focused window's set. */
  byWindow: Record<WindowId, MenuTemplate[]>;
  setMenus: (windowId: WindowId, menus: MenuTemplate[]) => void;
  clearMenus: (windowId: WindowId) => void;
}

export const useMenuStore = create<MenuStore>((set) => ({
  byWindow: {},
  setMenus: (windowId, menus) => set((s) => ({ byWindow: { ...s.byWindow, [windowId]: menus } })),
  clearMenus: (windowId) =>
    set((s) => {
      if (!(windowId in s.byWindow)) return s;
      const byWindow = { ...s.byWindow };
      delete byWindow[windowId];
      return { byWindow };
    }),
}));

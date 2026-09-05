import { create } from 'zustand';

/** Transient UI state of the shell: which overlay is open. Nothing here persists. */
interface ShellStore {
  startMenu: boolean;
  spotlight: boolean;
  controlCenter: boolean;
  notificationCenter: boolean;
  missionControl: boolean;
  /** Alt+Tab switcher: index into the visible window order, or null. */
  switcher: number | null;
  /** Any window is being dragged/resized: content gets pointer-events: none so iframes do not swallow moves. */
  interacting: boolean;
  /** Screen dimming from the Control Center brightness slider, 0.3–1. */
  brightness: number;
  /**
   * Whether the browser tab or desktop window Lumen runs in has focus. When it
   * does not, the window in front stops looking like the window in front: the
   * keyboard is somewhere else entirely, and pretending otherwise is what
   * makes a page feel like a page rather than a system.
   */
  hostFocused: boolean;
  toggle: (
    key: 'startMenu' | 'spotlight' | 'controlCenter' | 'notificationCenter' | 'missionControl',
    value?: boolean,
  ) => void;
  closeAll: () => void;
  setSwitcher: (index: number | null) => void;
  setInteracting: (value: boolean) => void;
  setBrightness: (value: number) => void;
  setHostFocused: (value: boolean) => void;
}

export const useShellStore = create<ShellStore>((set) => ({
  startMenu: false,
  spotlight: false,
  controlCenter: false,
  notificationCenter: false,
  missionControl: false,
  switcher: null,
  interacting: false,
  brightness: 1,
  hostFocused: true,
  toggle: (key, value) =>
    set((s) => {
      const next = value ?? !s[key];
      // overlays are exclusive
      const cleared = {
        startMenu: false,
        spotlight: false,
        controlCenter: false,
        notificationCenter: false,
        missionControl: false,
      };
      return { ...cleared, [key]: next };
    }),
  closeAll: () =>
    set({
      startMenu: false,
      spotlight: false,
      controlCenter: false,
      notificationCenter: false,
      missionControl: false,
      switcher: null,
    }),
  setSwitcher: (index) => set({ switcher: index }),
  setInteracting: (value) => set({ interacting: value }),
  setHostFocused: (value) => set({ hostFocused: value }),
  setBrightness: (value) => set({ brightness: Math.max(0.3, Math.min(1, value)) }),
}));

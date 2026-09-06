/**
 * Whether the panels should get out of the way.
 *
 * A window in full screen is a window that asked for the whole display. The
 * system bar and the taskbar slide off and come back when the pointer reaches
 * the edge they left from — separately, because someone who wants the clock
 * gone may still want the taskbar, and Settings > Windows holds both switches.
 */

import { useWindowStore } from '@lumen/kernel';
import { useSettings } from '@lumen/kernel/react';

/** True while a window is full screen and on screen. */
export function useFullscreenWindow(): boolean {
  return useWindowStore((s) =>
    Object.values(s.windows).some((w) => w.fullscreen && !w.minimized && !w.closing),
  );
}

export interface Immersive {
  systemBar: boolean;
  taskbar: boolean;
}

export function useImmersive(): Immersive {
  const fullscreen = useFullscreenWindow();
  const windows = useSettings().windows;
  // A panel gets out of the way only when the window is going to use the
  // space. With full screen set to stop at the panels, sliding them off would
  // uncover the wallpaper and nothing else.
  const covers = fullscreen && windows.fullscreenCoversPanels;
  return {
    systemBar: covers && windows.immersiveSystemBar,
    taskbar: covers && windows.immersiveTaskbar,
  };
}

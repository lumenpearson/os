/**
 * The title bar's own menu. Every item here is something the window store
 * already does — minimize, toggleMaximize, snap, close — so the menu, the
 * three controls and the keyboard all take the same path.
 */

import type { GlobalShortcutId, SnapSide } from '@lumen/kernel';
import type { MenuEntry } from '@lumen/ui';

export interface WindowMenuState {
  minimizable: boolean;
  maximizable: boolean;
  closable: boolean;
  /** Snapping is on in Settings → Display, so the halves are reachable. */
  snapping: boolean;
  /** The half the window is already tiled to, if any. */
  snap: SnapSide | null;
  /** Full screen has taken the display: there is no frame left to move. */
  fullscreen: boolean;
}

export interface WindowMenuActions {
  minimize: () => void;
  zoom: () => void;
  snapLeft: () => void;
  snapRight: () => void;
  close: () => void;
}

export function windowMenuItems(
  state: WindowMenuState,
  actions: WindowMenuActions,
  shortcut: (id: GlobalShortcutId) => string,
): MenuEntry[] {
  const items: MenuEntry[] = [
    {
      id: 'minimize',
      label: 'Minimize',
      shortcut: shortcut('window.minimize'),
      enabled: state.minimizable && !state.fullscreen,
      onSelect: actions.minimize,
    },
    {
      id: 'zoom',
      label: 'Zoom',
      shortcut: shortcut('window.maximize'),
      enabled: state.maximizable && !state.fullscreen,
      onSelect: actions.zoom,
    },
  ];
  // The halves are only offered where they exist: a person who turned
  // snapping off in Settings is not shown two items that would do nothing.
  if (state.snapping) {
    items.push(
      { id: 'tile-sep', type: 'separator' },
      {
        id: 'snap-left',
        label: 'Snap Left',
        shortcut: shortcut('window.snapLeft'),
        enabled: !state.fullscreen && state.snap !== 'left',
        onSelect: actions.snapLeft,
      },
      {
        id: 'snap-right',
        label: 'Snap Right',
        shortcut: shortcut('window.snapRight'),
        enabled: !state.fullscreen && state.snap !== 'right',
        onSelect: actions.snapRight,
      },
    );
  }
  items.push(
    { id: 'close-sep', type: 'separator' },
    {
      id: 'close',
      label: 'Close',
      shortcut: shortcut('window.close'),
      enabled: state.closable,
      onSelect: actions.close,
    },
  );
  return items;
}

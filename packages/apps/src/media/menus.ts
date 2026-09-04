/**
 * The menubar for a player window. Built from one snapshot of state so a
 * command reads the same whether it is clicked or typed.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { RATES } from './config';
import type { LoopMode } from './queue';
import { formatRate } from './time';

export interface MediaMenuState {
  hasTracks: boolean;
  hasTrack: boolean;
  playing: boolean;
  loop: LoopMode;
  shuffle: boolean;
  rate: number;
  fullscreen: boolean;
  showPlaylist: boolean;
  showVisualiser: boolean;
  /** The visualiser needs audio and a working AudioContext. */
  canVisualise: boolean;
}

export interface MediaActions {
  open: () => void;
  addFiles: () => void;
  addFolder: () => void;
  clear: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  setRate: (rate: number) => void;
  setLoop: (mode: LoopMode) => void;
  toggleShuffle: () => void;
  toggleFullscreen: () => void;
  togglePlaylist: () => void;
  toggleVisualiser: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

const LOOP_LABELS: Array<{ mode: LoopMode; label: string }> = [
  { mode: 'off', label: 'Off' },
  { mode: 'all', label: 'All' },
  { mode: 'one', label: 'One' },
];

export function buildMediaMenus(state: MediaMenuState, actions: MediaActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'open', label: 'Open…', shortcut: 'Mod+O', onSelect: actions.open },
        {
          id: 'add-files',
          label: 'Add to Playlist…',
          shortcut: 'Shift+Mod+O',
          onSelect: actions.addFiles,
        },
        { id: 'add-folder', label: 'Add Folder…', onSelect: actions.addFolder },
        separator,
        {
          id: 'clear',
          label: 'Clear Playlist',
          enabled: state.hasTracks,
          onSelect: actions.clear,
        },
      ],
    },
    {
      id: 'playback',
      label: 'Playback',
      items: [
        {
          id: 'toggle',
          label: state.playing ? 'Pause' : 'Play',
          shortcut: 'Space',
          enabled: state.hasTrack,
          onSelect: actions.toggle,
        },
        {
          id: 'next',
          label: 'Next',
          shortcut: 'N',
          enabled: state.hasTracks,
          onSelect: actions.next,
        },
        {
          id: 'previous',
          label: 'Previous',
          shortcut: 'P',
          enabled: state.hasTracks,
          onSelect: actions.previous,
        },
        separator,
        {
          id: 'rate',
          type: 'submenu',
          label: 'Rate',
          submenu: RATES.map((rate) => ({
            id: `rate-${rate}`,
            type: 'radio',
            label: formatRate(rate),
            checked: state.rate === rate,
            onSelect: () => actions.setRate(rate),
          })),
        },
        {
          id: 'loop',
          type: 'submenu',
          label: 'Loop',
          submenu: LOOP_LABELS.map(({ mode, label }) => ({
            id: `loop-${mode}`,
            type: 'radio',
            label,
            checked: state.loop === mode,
            onSelect: () => actions.setLoop(mode),
          })),
        },
        {
          id: 'shuffle',
          type: 'checkbox',
          label: 'Shuffle',
          checked: state.shuffle,
          onSelect: actions.toggleShuffle,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'fullscreen',
          type: 'checkbox',
          label: 'Full Screen',
          shortcut: 'F',
          checked: state.fullscreen,
          onSelect: actions.toggleFullscreen,
        },
        separator,
        {
          id: 'playlist',
          type: 'checkbox',
          label: 'Show Playlist',
          shortcut: 'Mod+L',
          checked: state.showPlaylist,
          onSelect: actions.togglePlaylist,
        },
        {
          id: 'visualiser',
          type: 'checkbox',
          label: 'Show Visualiser',
          checked: state.showVisualiser,
          enabled: state.canVisualise,
          onSelect: actions.toggleVisualiser,
        },
      ],
    },
  ];
}

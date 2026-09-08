/**
 * The menubar for a player window. Built from one snapshot of state so a
 * command reads the same whether it is clicked or typed.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';
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
  { mode: 'off', label: t('media.off') },
  { mode: 'all', label: t('media.all') },
  { mode: 'one', label: t('media.one') },
];

export function buildMediaMenus(state: MediaMenuState, actions: MediaActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'open', label: t('menu.open'), shortcut: 'Mod+O', onSelect: actions.open },
        {
          id: 'add-files',
          label: t('media.addToPlaylist'),
          shortcut: 'Shift+Mod+O',
          onSelect: actions.addFiles,
        },
        { id: 'add-folder', label: t('media.addFolder'), onSelect: actions.addFolder },
        separator,
        {
          id: 'clear',
          label: t('media.clearPlaylist'),
          enabled: state.hasTracks,
          onSelect: actions.clear,
        },
      ],
    },
    {
      id: 'playback',
      label: t('media.playback'),
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
          label: t('menu.next'),
          shortcut: 'N',
          enabled: state.hasTracks,
          onSelect: actions.next,
        },
        {
          id: 'previous',
          label: t('menu.previous'),
          shortcut: 'P',
          enabled: state.hasTracks,
          onSelect: actions.previous,
        },
        separator,
        {
          id: 'rate',
          type: 'submenu',
          label: t('media.rate'),
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
          label: t('media.loop'),
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
          label: t('media.shuffle'),
          checked: state.shuffle,
          onSelect: actions.toggleShuffle,
        },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'fullscreen',
          type: 'checkbox',
          label: t('menu.fullScreen'),
          shortcut: 'F',
          checked: state.fullscreen,
          onSelect: actions.toggleFullscreen,
        },
        separator,
        {
          id: 'playlist',
          type: 'checkbox',
          label: t('media.showPlaylist'),
          shortcut: 'Mod+L',
          checked: state.showPlaylist,
          onSelect: actions.togglePlaylist,
        },
        {
          id: 'visualiser',
          type: 'checkbox',
          label: t('media.showVisualiser'),
          checked: state.showVisualiser,
          enabled: state.canVisualise,
          onSelect: actions.toggleVisualiser,
        },
      ],
    },
  ];
}

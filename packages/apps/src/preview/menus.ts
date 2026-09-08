/**
 * The menubar for a Preview window, built from one snapshot of state so a
 * command reads the same whether it is clicked or typed.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';

export interface PreviewMenuState {
  /** A file is open and readable. */
  hasFile: boolean;
  /** The viewer draws pixels, so zoom, rotate and flip apply. */
  zoomable: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  /** The file has markup behind the picture (SVG). */
  hasSource: boolean;
  showingSource: boolean;
  /** There are images in the folder to line up. */
  canFilmstrip: boolean;
  filmstrip: boolean;
  fullScreen: boolean;
}

export interface PreviewActions {
  open: () => void;
  reveal: () => void;
  previous: () => void;
  next: () => void;
  close: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  actualSize: () => void;
  fitToWindow: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  toggleFullScreen: () => void;
  toggleFilmstrip: () => void;
  toggleSource: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildPreviewMenus(
  state: PreviewMenuState,
  actions: PreviewActions,
): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'open', label: t('menu.open'), shortcut: 'Mod+O', onSelect: actions.open },
        {
          id: 'reveal',
          label: t('menu.revealInFiles'),
          shortcut: 'Shift+Mod+R',
          enabled: state.hasFile,
          onSelect: actions.reveal,
        },
        separator,
        {
          id: 'previous',
          label: t('menu.previous'),
          shortcut: 'Mod+Left',
          enabled: state.hasPrevious,
          onSelect: actions.previous,
        },
        {
          id: 'next',
          label: t('menu.next'),
          shortcut: 'Mod+Right',
          enabled: state.hasNext,
          onSelect: actions.next,
        },
        separator,
        { id: 'close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'zoom-in',
          label: t('menu.zoomIn'),
          shortcut: 'Mod+=',
          enabled: state.zoomable,
          onSelect: actions.zoomIn,
        },
        {
          id: 'zoom-out',
          label: t('menu.zoomOut'),
          shortcut: 'Mod+-',
          enabled: state.zoomable,
          onSelect: actions.zoomOut,
        },
        {
          id: 'actual-size',
          label: t('menu.actualSize'),
          shortcut: 'Mod+0',
          enabled: state.zoomable,
          onSelect: actions.actualSize,
        },
        {
          id: 'fit',
          label: t('menu.fitToWindow'),
          shortcut: 'Mod+9',
          enabled: state.zoomable,
          onSelect: actions.fitToWindow,
        },
        separator,
        {
          id: 'rotate-left',
          label: t('menu.rotateLeft'),
          shortcut: 'Mod+L',
          enabled: state.zoomable,
          onSelect: actions.rotateLeft,
        },
        {
          id: 'rotate-right',
          label: t('menu.rotateRight'),
          shortcut: 'Mod+R',
          enabled: state.zoomable,
          onSelect: actions.rotateRight,
        },
        {
          id: 'flip-horizontal',
          label: t('menu.flipHorizontal'),
          enabled: state.zoomable,
          onSelect: actions.flipHorizontal,
        },
        {
          id: 'flip-vertical',
          label: t('menu.flipVertical'),
          enabled: state.zoomable,
          onSelect: actions.flipVertical,
        },
        separator,
        {
          id: 'source',
          type: 'checkbox',
          label: t('preview.viewSource'),
          shortcut: 'Shift+Mod+U',
          checked: state.showingSource,
          enabled: state.hasSource,
          onSelect: actions.toggleSource,
        },
        {
          id: 'filmstrip',
          type: 'checkbox',
          label: t('preview.showFilmstrip'),
          checked: state.filmstrip,
          enabled: state.canFilmstrip,
          onSelect: actions.toggleFilmstrip,
        },
        separator,
        {
          id: 'full-screen',
          type: 'checkbox',
          label: t('menu.fullScreen'),
          shortcut: 'F',
          checked: state.fullScreen,
          enabled: state.hasFile,
          onSelect: actions.toggleFullScreen,
        },
      ],
    },
  ];
}

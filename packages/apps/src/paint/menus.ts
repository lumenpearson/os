import { t } from '@lumen/kernel';
/**
 * The menubar for a Paint window, built from one snapshot of state so a
 * command reads the same whether it is clicked or typed.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export interface PaintMenuState {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  /** Something has been cut or copied in this window. */
  hasClipboard: boolean;
  showGrid: boolean;
  /** The pixels are large enough for a grid between them to mean anything. */
  gridAvailable: boolean;
}

export interface PaintActions {
  newDocument: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  exportPng: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  deselect: () => void;
  crop: () => void;
  canvasSize: () => void;
  scaleImage: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  actualSize: () => void;
  fitToWindow: () => void;
  toggleGrid: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildPaintMenus(state: PaintMenuState, actions: PaintActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'new', label: t('menu.new'), shortcut: 'Mod+N', onSelect: actions.newDocument },
        { id: 'open', label: t('menu.open'), shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        { id: 'save', label: t('menu.save'), shortcut: 'Mod+S', onSelect: actions.save },
        {
          id: 'save-as',
          label: t('menu.saveAs'),
          shortcut: 'Shift+Mod+S',
          onSelect: actions.saveAs,
        },
        {
          id: 'export',
          label: 'Export PNG…',
          shortcut: 'Shift+Mod+E',
          onSelect: actions.exportPng,
        },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        {
          id: 'undo',
          label: t('menu.undo'),
          shortcut: 'Mod+Z',
          enabled: state.canUndo,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: t('menu.redo'),
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo,
          onSelect: actions.redo,
        },
        separator,
        {
          id: 'cut',
          label: t('action.cut'),
          shortcut: 'Mod+X',
          enabled: state.hasSelection,
          onSelect: actions.cut,
        },
        {
          id: 'copy',
          label: t('action.copy'),
          shortcut: 'Mod+C',
          enabled: state.hasSelection,
          onSelect: actions.copy,
        },
        {
          id: 'paste',
          label: t('action.paste'),
          shortcut: 'Mod+V',
          enabled: state.hasClipboard,
          onSelect: actions.paste,
        },
        separator,
        {
          id: 'select-all',
          label: t('menu.selectAll'),
          shortcut: 'Mod+A',
          onSelect: actions.selectAll,
        },
        {
          id: 'deselect',
          label: 'Deselect',
          shortcut: 'Mod+D',
          enabled: state.hasSelection,
          onSelect: actions.deselect,
        },
        {
          id: 'crop',
          label: 'Crop to Selection',
          shortcut: 'Shift+Mod+X',
          enabled: state.hasSelection,
          onSelect: actions.crop,
        },
      ],
    },
    {
      id: 'image',
      label: 'Image',
      items: [
        {
          id: 'canvas-size',
          label: 'Canvas Size…',
          shortcut: 'Shift+Mod+C',
          onSelect: actions.canvasSize,
        },
        { id: 'scale', label: 'Scale…', shortcut: 'Shift+Mod+I', onSelect: actions.scaleImage },
        separator,
        { id: 'flip-h', label: t('menu.flipHorizontal'), onSelect: actions.flipHorizontal },
        { id: 'flip-v', label: t('menu.flipVertical'), onSelect: actions.flipVertical },
        separator,
        {
          id: 'rotate-left',
          label: t('menu.rotateLeft'),
          shortcut: 'Mod+[',
          onSelect: actions.rotateLeft,
        },
        {
          id: 'rotate-right',
          label: t('menu.rotateRight'),
          shortcut: 'Mod+]',
          onSelect: actions.rotateRight,
        },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        { id: 'zoom-in', label: t('menu.zoomIn'), shortcut: 'Mod+=', onSelect: actions.zoomIn },
        { id: 'zoom-out', label: t('menu.zoomOut'), shortcut: 'Mod+-', onSelect: actions.zoomOut },
        {
          id: 'actual-size',
          label: t('menu.actualSize'),
          shortcut: 'Mod+0',
          onSelect: actions.actualSize,
        },
        {
          id: 'fit',
          label: t('menu.fitToWindow'),
          shortcut: 'Mod+9',
          onSelect: actions.fitToWindow,
        },
        separator,
        {
          id: 'grid',
          type: 'checkbox',
          label: 'Show Grid',
          shortcut: 'Shift+Mod+G',
          checked: state.showGrid,
          enabled: state.gridAvailable,
          onSelect: actions.toggleGrid,
        },
      ],
    },
  ];
}

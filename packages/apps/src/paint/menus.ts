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
      label: 'File',
      items: [
        { id: 'new', label: 'New', shortcut: 'Mod+N', onSelect: actions.newDocument },
        { id: 'open', label: 'Open…', shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        { id: 'save', label: 'Save', shortcut: 'Mod+S', onSelect: actions.save },
        { id: 'save-as', label: 'Save As…', shortcut: 'Shift+Mod+S', onSelect: actions.saveAs },
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
      label: 'Edit',
      items: [
        {
          id: 'undo',
          label: 'Undo',
          shortcut: 'Mod+Z',
          enabled: state.canUndo,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: 'Redo',
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo,
          onSelect: actions.redo,
        },
        separator,
        {
          id: 'cut',
          label: 'Cut',
          shortcut: 'Mod+X',
          enabled: state.hasSelection,
          onSelect: actions.cut,
        },
        {
          id: 'copy',
          label: 'Copy',
          shortcut: 'Mod+C',
          enabled: state.hasSelection,
          onSelect: actions.copy,
        },
        {
          id: 'paste',
          label: 'Paste',
          shortcut: 'Mod+V',
          enabled: state.hasClipboard,
          onSelect: actions.paste,
        },
        separator,
        { id: 'select-all', label: 'Select All', shortcut: 'Mod+A', onSelect: actions.selectAll },
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
        { id: 'flip-h', label: 'Flip Horizontal', onSelect: actions.flipHorizontal },
        { id: 'flip-v', label: 'Flip Vertical', onSelect: actions.flipVertical },
        separator,
        {
          id: 'rotate-left',
          label: 'Rotate Left',
          shortcut: 'Mod+[',
          onSelect: actions.rotateLeft,
        },
        {
          id: 'rotate-right',
          label: 'Rotate Right',
          shortcut: 'Mod+]',
          onSelect: actions.rotateRight,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'zoom-in', label: 'Zoom In', shortcut: 'Mod+=', onSelect: actions.zoomIn },
        { id: 'zoom-out', label: 'Zoom Out', shortcut: 'Mod+-', onSelect: actions.zoomOut },
        {
          id: 'actual-size',
          label: 'Actual Size',
          shortcut: 'Mod+0',
          onSelect: actions.actualSize,
        },
        {
          id: 'fit',
          label: 'Fit to Window',
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

/**
 * The menubar for a Sheets window. Pure: it maps an action table to menu
 * templates, so the shape of the menus (and their shortcuts) is testable
 * without rendering the app.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { type Align, NUMBER_FORMATS, type NumberFormat } from './engine/format';

export interface SheetsMenuState {
  canUndo: boolean;
  canRedo: boolean;
  bold: boolean;
  italic: boolean;
  align: Align | undefined;
  format: NumberFormat;
  canDeleteSheet: boolean;
}

export interface SheetsMenuActions {
  newWindow: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  exportCsv: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  clear: () => void;
  selectAll: () => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  setAlign: (align: Align) => void;
  setFormat: (format: NumberFormat) => void;
  insertRowAbove: () => void;
  insertRowBelow: () => void;
  insertColumnLeft: () => void;
  insertColumnRight: () => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  addSheet: () => void;
  renameSheet: () => void;
  deleteSheet: () => void;
  showFunctions: () => void;
}

const ALIGNS: Array<{ value: Align; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export function buildMenus(state: SheetsMenuState, actions: SheetsMenuActions): MenuTemplate[] {
  const alignItems: MenuItemTemplate[] = ALIGNS.map((option) => ({
    id: `align-${option.value}`,
    label: option.label,
    type: 'radio',
    checked: state.align === option.value,
    onSelect: () => actions.setAlign(option.value),
  }));

  const formatItems: MenuItemTemplate[] = NUMBER_FORMATS.map((option) => ({
    id: `format-${option.value}`,
    label: option.label,
    type: 'radio',
    checked: state.format === option.value,
    onSelect: () => actions.setFormat(option.value),
  }));

  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', shortcut: 'Mod+N', onSelect: actions.newWindow },
        { id: 'open', label: 'Open…', shortcut: 'Mod+O', onSelect: actions.open },
        { id: 'file-sep-1', type: 'separator' },
        { id: 'save', label: 'Save', shortcut: 'Mod+S', onSelect: actions.save },
        { id: 'save-as', label: 'Save As…', shortcut: 'Shift+Mod+S', onSelect: actions.saveAs },
        { id: 'export-csv', label: 'Export CSV…', onSelect: actions.exportCsv },
        { id: 'file-sep-2', type: 'separator' },
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
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
        { id: 'edit-sep-1', type: 'separator' },
        { id: 'cut', label: 'Cut', shortcut: 'Mod+X', onSelect: actions.cut },
        { id: 'copy', label: 'Copy', shortcut: 'Mod+C', onSelect: actions.copy },
        { id: 'paste', label: 'Paste', shortcut: 'Mod+V', onSelect: actions.paste },
        { id: 'clear', label: 'Clear', shortcut: 'Delete', onSelect: actions.clear },
        { id: 'edit-sep-2', type: 'separator' },
        { id: 'select-all', label: 'Select All', shortcut: 'Mod+A', onSelect: actions.selectAll },
      ],
    },
    {
      id: 'format',
      label: 'Format',
      items: [
        {
          id: 'bold',
          label: 'Bold',
          shortcut: 'Mod+B',
          type: 'checkbox',
          checked: state.bold,
          onSelect: actions.toggleBold,
        },
        {
          id: 'italic',
          label: 'Italic',
          shortcut: 'Mod+I',
          type: 'checkbox',
          checked: state.italic,
          onSelect: actions.toggleItalic,
        },
        { id: 'format-sep-1', type: 'separator' },
        { id: 'align', label: 'Align', type: 'submenu', submenu: alignItems },
        { id: 'number', label: 'Number', type: 'submenu', submenu: formatItems },
      ],
    },
    {
      id: 'insert',
      label: 'Insert',
      items: [
        { id: 'row-above', label: 'Row Above', onSelect: actions.insertRowAbove },
        { id: 'row-below', label: 'Row Below', onSelect: actions.insertRowBelow },
        { id: 'column-left', label: 'Column Left', onSelect: actions.insertColumnLeft },
        { id: 'column-right', label: 'Column Right', onSelect: actions.insertColumnRight },
        { id: 'insert-sep-1', type: 'separator' },
        { id: 'delete-row', label: 'Delete Row', onSelect: actions.deleteRow },
        { id: 'delete-column', label: 'Delete Column', onSelect: actions.deleteColumn },
      ],
    },
    {
      id: 'sheet',
      label: 'Sheet',
      items: [
        { id: 'add-sheet', label: 'Add Sheet', onSelect: actions.addSheet },
        { id: 'rename-sheet', label: 'Rename…', onSelect: actions.renameSheet },
        {
          id: 'delete-sheet',
          label: 'Delete Sheet',
          danger: true,
          enabled: state.canDeleteSheet,
          onSelect: actions.deleteSheet,
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ id: 'functions', label: 'Functions…', onSelect: actions.showFunctions }],
    },
  ];
}

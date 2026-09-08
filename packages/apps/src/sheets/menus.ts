/**
 * The menubar for a Sheets window. Pure: it maps an action table to menu
 * templates, so the shape of the menus (and their shortcuts) is testable
 * without rendering the app.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';
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
  { value: 'left', label: t('menu.left') },
  { value: 'center', label: t('sheets.center') },
  { value: 'right', label: t('menu.right') },
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
      label: t('menu.file'),
      items: [
        { id: 'new', label: t('menu.new'), shortcut: 'Mod+N', onSelect: actions.newWindow },
        { id: 'open', label: t('menu.open'), shortcut: 'Mod+O', onSelect: actions.open },
        { id: 'file-sep-1', type: 'separator' },
        { id: 'save', label: t('menu.save'), shortcut: 'Mod+S', onSelect: actions.save },
        {
          id: 'save-as',
          label: t('menu.saveAs'),
          shortcut: 'Shift+Mod+S',
          onSelect: actions.saveAs,
        },
        { id: 'export-csv', label: t('sheets.exportCsv'), onSelect: actions.exportCsv },
        { id: 'file-sep-2', type: 'separator' },
        { id: 'close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.close },
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
        { id: 'edit-sep-1', type: 'separator' },
        { id: 'cut', label: t('action.cut'), shortcut: 'Mod+X', onSelect: actions.cut },
        { id: 'copy', label: t('action.copy'), shortcut: 'Mod+C', onSelect: actions.copy },
        { id: 'paste', label: t('action.paste'), shortcut: 'Mod+V', onSelect: actions.paste },
        { id: 'clear', label: t('menu.clear'), shortcut: 'Delete', onSelect: actions.clear },
        { id: 'edit-sep-2', type: 'separator' },
        {
          id: 'select-all',
          label: t('menu.selectAll'),
          shortcut: 'Mod+A',
          onSelect: actions.selectAll,
        },
      ],
    },
    {
      id: 'format',
      label: t('menu.format'),
      items: [
        {
          id: 'bold',
          label: t('menu.bold'),
          shortcut: 'Mod+B',
          type: 'checkbox',
          checked: state.bold,
          onSelect: actions.toggleBold,
        },
        {
          id: 'italic',
          label: t('menu.italic'),
          shortcut: 'Mod+I',
          type: 'checkbox',
          checked: state.italic,
          onSelect: actions.toggleItalic,
        },
        { id: 'format-sep-1', type: 'separator' },
        { id: 'align', label: t('sheets.align'), type: 'submenu', submenu: alignItems },
        { id: 'number', label: t('sheets.number'), type: 'submenu', submenu: formatItems },
      ],
    },
    {
      id: 'insert',
      label: t('sheets.insert'),
      items: [
        { id: 'row-above', label: t('sheets.rowAbove'), onSelect: actions.insertRowAbove },
        { id: 'row-below', label: t('sheets.rowBelow'), onSelect: actions.insertRowBelow },
        { id: 'column-left', label: t('sheets.columnLeft'), onSelect: actions.insertColumnLeft },
        { id: 'column-right', label: t('sheets.columnRight'), onSelect: actions.insertColumnRight },
        { id: 'insert-sep-1', type: 'separator' },
        { id: 'delete-row', label: t('sheets.deleteRow'), onSelect: actions.deleteRow },
        { id: 'delete-column', label: t('sheets.deleteColumn'), onSelect: actions.deleteColumn },
      ],
    },
    {
      id: 'sheet',
      label: t('sheets.sheet'),
      items: [
        { id: 'add-sheet', label: t('sheets.addSheet'), onSelect: actions.addSheet },
        { id: 'rename-sheet', label: t('menu.renameEllipsis'), onSelect: actions.renameSheet },
        {
          id: 'delete-sheet',
          label: t('sheets.deleteSheet'),
          danger: true,
          enabled: state.canDeleteSheet,
          onSelect: actions.deleteSheet,
        },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [{ id: 'functions', label: t('sheets.functions'), onSelect: actions.showFunctions }],
    },
  ];
}

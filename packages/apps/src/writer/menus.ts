/**
 * The menubar. Every command in the app is reachable from here, and the
 * toolbar calls into the same actions object, so a command behaves the same
 * however it is invoked.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';
import {
  type Alignment,
  BLOCK_TYPES,
  type BlockType,
  type EditorState,
  type Mark,
} from './editing';

export type ExportFormat = 'html' | 'markdown' | 'text';

export interface WriterActions {
  newDocument: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  exportAs: (format: ExportFormat) => void;
  closeWindow: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  find: () => void;
  findNext: () => void;
  findPrevious: () => void;
  setBlock: (block: BlockType) => void;
  toggleMark: (mark: Mark) => void;
  toggleList: (kind: 'bullet' | 'number') => void;
  setAlignment: (align: Alignment) => void;
  indent: () => void;
  outdent: () => void;
  link: () => void;
  removeLink: () => void;
  clearFormatting: () => void;
  insertRule: () => void;
  insertDate: () => void;
  toggleReadingMode: () => void;
  toggleFullScreen: () => void;
  showShortcuts: () => void;
  showAbout: () => void;
}

export interface WriterMenuState {
  editor: EditorState;
  readOnly: boolean;
  readingMode: boolean;
  fullscreen: boolean;
  hasMatches: boolean;
}

const separator: MenuItemTemplate = { type: 'separator' };

const ALIGNMENTS: Array<{ value: Alignment; label: string }> = [
  { value: 'left', label: t('menu.left') },
  { value: 'center', label: t('writer.centre') },
  { value: 'right', label: t('menu.right') },
];

export function buildMenus(state: WriterMenuState, actions: WriterActions): MenuTemplate[] {
  // Reading mode locks the page, so the commands that would write to it rest.
  const editable = !state.readOnly && !state.readingMode;
  return [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'new', label: t('menu.new'), shortcut: 'Mod+N', onSelect: actions.newDocument },
        { id: 'open', label: t('menu.open'), shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        {
          id: 'save',
          label: t('menu.save'),
          shortcut: 'Mod+S',
          enabled: !state.readOnly,
          onSelect: actions.save,
        },
        {
          id: 'save-as',
          label: t('menu.saveAs'),
          shortcut: 'Shift+Mod+S',
          onSelect: actions.saveAs,
        },
        separator,
        {
          id: 'export-html',
          label: t('menu.exportHtml'),
          onSelect: () => actions.exportAs('html'),
        },
        {
          id: 'export-markdown',
          label: t('menu.exportMarkdown'),
          onSelect: () => actions.exportAs('markdown'),
        },
        {
          id: 'export-text',
          label: t('menu.exportPlainText'),
          onSelect: () => actions.exportAs('text'),
        },
        separator,
        { id: 'close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.closeWindow },
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
          enabled: editable,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: t('menu.redo'),
          shortcut: 'Shift+Mod+Z',
          enabled: editable,
          onSelect: actions.redo,
        },
        separator,
        { id: 'cut', label: t('action.cut'), enabled: editable, onSelect: actions.cut },
        { id: 'copy', label: t('action.copy'), onSelect: actions.copy },
        { id: 'paste', label: t('action.paste'), enabled: editable, onSelect: actions.paste },
        separator,
        {
          id: 'select-all',
          label: t('menu.selectAll'),
          shortcut: 'Mod+A',
          onSelect: actions.selectAll,
        },
        separator,
        { id: 'find', label: t('menu.findEllipsis'), shortcut: 'Mod+F', onSelect: actions.find },
        {
          id: 'find-next',
          label: t('writer.findNext'),
          shortcut: 'Mod+G',
          enabled: state.hasMatches,
          onSelect: actions.findNext,
        },
        {
          id: 'find-previous',
          label: t('writer.findPrevious'),
          shortcut: 'Shift+Mod+G',
          enabled: state.hasMatches,
          onSelect: actions.findPrevious,
        },
      ],
    },
    formatMenu(state, actions, editable),
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'reading-mode',
          type: 'checkbox',
          label: t('writer.readingMode'),
          shortcut: 'Shift+Mod+R',
          checked: state.readingMode,
          onSelect: actions.toggleReadingMode,
        },
        separator,
        {
          id: 'fullscreen',
          type: 'checkbox',
          label: t('menu.fullScreen'),
          shortcut: 'F11',
          checked: state.fullscreen,
          onSelect: actions.toggleFullScreen,
        },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [
        { id: 'shortcuts', label: t('writer.shortcuts'), onSelect: actions.showShortcuts },
        { id: 'about', label: t('writer.about'), onSelect: actions.showAbout },
      ],
    },
  ];
}

function formatMenu(
  state: WriterMenuState,
  actions: WriterActions,
  editable: boolean,
): MenuTemplate {
  const { editor } = state;
  return {
    id: 'format',
    label: t('menu.format'),
    items: [
      mark('bold', 'Bold', 'Mod+B', editor.bold, editable, actions),
      mark('italic', 'Italic', 'Mod+I', editor.italic, editable, actions),
      mark('underline', 'Underline', 'Mod+U', editor.underline, editable, actions),
      mark('strikeThrough', 'Strikethrough', 'Shift+Mod+X', editor.strike, editable, actions),
      separator,
      {
        id: 'paragraph-style',
        type: 'submenu',
        label: t('writer.paragraphStyle'),
        enabled: editable,
        submenu: BLOCK_TYPES.map((block) => ({
          id: `block-${block.value}`,
          type: 'radio',
          label: block.label,
          checked: editor.block === block.value,
          onSelect: () => actions.setBlock(block.value),
        })),
      },
      {
        id: 'align',
        type: 'submenu',
        label: t('writer.alignment'),
        enabled: editable,
        submenu: ALIGNMENTS.map((option) => ({
          id: `align-${option.value}`,
          type: 'radio',
          label: option.label,
          checked: editor.align === option.value,
          onSelect: () => actions.setAlignment(option.value),
        })),
      },
      separator,
      {
        id: 'bullet-list',
        type: 'checkbox',
        label: t('writer.bulletedList'),
        shortcut: 'Shift+Mod+8',
        checked: editor.bulletList,
        enabled: editable,
        onSelect: () => actions.toggleList('bullet'),
      },
      {
        id: 'number-list',
        type: 'checkbox',
        label: t('writer.numberedList'),
        shortcut: 'Shift+Mod+7',
        checked: editor.numberList,
        enabled: editable,
        onSelect: () => actions.toggleList('number'),
      },
      {
        id: 'indent',
        label: t('writer.indent'),
        shortcut: 'Mod+]',
        enabled: editable,
        onSelect: actions.indent,
      },
      {
        id: 'outdent',
        label: t('writer.outdent'),
        shortcut: 'Mod+[',
        enabled: editable,
        onSelect: actions.outdent,
      },
      separator,
      {
        id: 'link',
        label: t('writer.link'),
        shortcut: 'Mod+K',
        enabled: editable,
        onSelect: actions.link,
      },
      {
        id: 'remove-link',
        label: t('writer.removeLink'),
        enabled: editable && editor.link,
        onSelect: actions.removeLink,
      },
      {
        id: 'clear-formatting',
        label: t('writer.clearFormatting'),
        shortcut: 'Mod+\\',
        enabled: editable,
        onSelect: actions.clearFormatting,
      },
      separator,
      {
        id: 'insert-rule',
        label: t('writer.horizontalRule'),
        enabled: editable,
        onSelect: actions.insertRule,
      },
      {
        id: 'insert-date',
        label: t('writer.insertDate'),
        enabled: editable,
        onSelect: actions.insertDate,
      },
    ],
  };
}

function mark(
  value: Mark,
  label: string,
  shortcut: string,
  checked: boolean,
  editable: boolean,
  actions: WriterActions,
): MenuItemTemplate {
  return {
    id: `mark-${value}`,
    type: 'checkbox',
    label,
    shortcut,
    checked,
    enabled: editable,
    onSelect: () => actions.toggleMark(value),
  };
}

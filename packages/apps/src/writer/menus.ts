/**
 * The menubar. Every command in the app is reachable from here, and the
 * toolbar calls into the same actions object, so a command behaves the same
 * however it is invoked.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
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
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

export function buildMenus(state: WriterMenuState, actions: WriterActions): MenuTemplate[] {
  const editable = !state.readOnly;
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', shortcut: 'Mod+N', onSelect: actions.newDocument },
        { id: 'open', label: 'Open…', shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        { id: 'save', label: 'Save', shortcut: 'Mod+S', enabled: editable, onSelect: actions.save },
        { id: 'save-as', label: 'Save As…', shortcut: 'Shift+Mod+S', onSelect: actions.saveAs },
        separator,
        { id: 'export-html', label: 'Export as HTML…', onSelect: () => actions.exportAs('html') },
        {
          id: 'export-markdown',
          label: 'Export as Markdown…',
          onSelect: () => actions.exportAs('markdown'),
        },
        {
          id: 'export-text',
          label: 'Export as Plain Text…',
          onSelect: () => actions.exportAs('text'),
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.closeWindow },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', shortcut: 'Mod+Z', enabled: editable, onSelect: actions.undo },
        {
          id: 'redo',
          label: 'Redo',
          shortcut: 'Shift+Mod+Z',
          enabled: editable,
          onSelect: actions.redo,
        },
        separator,
        { id: 'cut', label: 'Cut', enabled: editable, onSelect: actions.cut },
        { id: 'copy', label: 'Copy', onSelect: actions.copy },
        { id: 'paste', label: 'Paste', enabled: editable, onSelect: actions.paste },
        separator,
        { id: 'select-all', label: 'Select All', shortcut: 'Mod+A', onSelect: actions.selectAll },
        separator,
        { id: 'find', label: 'Find…', shortcut: 'Mod+F', onSelect: actions.find },
        {
          id: 'find-next',
          label: 'Find Next',
          shortcut: 'Mod+G',
          enabled: state.hasMatches,
          onSelect: actions.findNext,
        },
        {
          id: 'find-previous',
          label: 'Find Previous',
          shortcut: 'Shift+Mod+G',
          enabled: state.hasMatches,
          onSelect: actions.findPrevious,
        },
      ],
    },
    formatMenu(state, actions, editable),
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'reading-mode',
          type: 'checkbox',
          label: 'Reading Mode',
          shortcut: 'Shift+Mod+R',
          checked: state.readingMode,
          onSelect: actions.toggleReadingMode,
        },
        separator,
        {
          id: 'fullscreen',
          type: 'checkbox',
          label: 'Full Screen',
          shortcut: 'F11',
          checked: state.fullscreen,
          onSelect: actions.toggleFullScreen,
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'shortcuts', label: 'Keyboard Shortcuts', onSelect: actions.showShortcuts },
        { id: 'about', label: 'About Writer', onSelect: actions.showAbout },
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
    label: 'Format',
    items: [
      mark('bold', 'Bold', 'Mod+B', editor.bold, editable, actions),
      mark('italic', 'Italic', 'Mod+I', editor.italic, editable, actions),
      mark('underline', 'Underline', 'Mod+U', editor.underline, editable, actions),
      mark('strikeThrough', 'Strikethrough', 'Shift+Mod+X', editor.strike, editable, actions),
      separator,
      {
        id: 'paragraph-style',
        type: 'submenu',
        label: 'Paragraph Style',
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
        label: 'Alignment',
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
        label: 'Bulleted List',
        shortcut: 'Shift+Mod+8',
        checked: editor.bulletList,
        enabled: editable,
        onSelect: () => actions.toggleList('bullet'),
      },
      {
        id: 'number-list',
        type: 'checkbox',
        label: 'Numbered List',
        shortcut: 'Shift+Mod+7',
        checked: editor.numberList,
        enabled: editable,
        onSelect: () => actions.toggleList('number'),
      },
      {
        id: 'indent',
        label: 'Indent',
        shortcut: 'Mod+]',
        enabled: editable,
        onSelect: actions.indent,
      },
      {
        id: 'outdent',
        label: 'Outdent',
        shortcut: 'Mod+[',
        enabled: editable,
        onSelect: actions.outdent,
      },
      separator,
      {
        id: 'link',
        label: 'Link…',
        shortcut: 'Mod+K',
        enabled: editable,
        onSelect: actions.link,
      },
      {
        id: 'remove-link',
        label: 'Remove Link',
        enabled: editable && editor.link,
        onSelect: actions.removeLink,
      },
      {
        id: 'clear-formatting',
        label: 'Clear Formatting',
        shortcut: 'Mod+\\',
        enabled: editable,
        onSelect: actions.clearFormatting,
      },
      separator,
      {
        id: 'insert-rule',
        label: 'Insert Horizontal Rule',
        enabled: editable,
        onSelect: actions.insertRule,
      },
      {
        id: 'insert-date',
        label: 'Insert Date',
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

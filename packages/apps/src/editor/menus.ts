/**
 * The menubar for the editor window. Built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';

export interface EditorMenuState {
  hasPath: boolean;
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  preview: boolean;
  isMarkdown: boolean;
}

export interface EditorActions {
  newWindow: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  find: () => void;
  replace: () => void;
  goToLine: () => void;
  toggleWordWrap: () => void;
  toggleLineNumbers: () => void;
  togglePreview: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  help: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildEditorMenus(state: EditorMenuState, actions: EditorActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', shortcut: 'Mod+N', onSelect: actions.newWindow },
        { id: 'open', label: 'Open…', shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        {
          id: 'save',
          label: 'Save',
          shortcut: 'Mod+S',
          enabled: !state.readOnly,
          onSelect: actions.save,
        },
        {
          id: 'save-as',
          label: 'Save As…',
          shortcut: 'Shift+Mod+S',
          onSelect: actions.saveAs,
        },
        separator,
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
          enabled: state.canUndo && !state.readOnly,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: 'Redo',
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo && !state.readOnly,
          onSelect: actions.redo,
        },
        separator,
        {
          id: 'cut',
          label: 'Cut',
          shortcut: 'Mod+X',
          enabled: state.hasSelection && !state.readOnly,
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
          enabled: !state.readOnly,
          onSelect: actions.paste,
        },
        { id: 'select-all', label: 'Select All', shortcut: 'Mod+A', onSelect: actions.selectAll },
        separator,
        { id: 'find', label: 'Find…', shortcut: 'Mod+F', onSelect: actions.find },
        {
          id: 'replace',
          label: 'Replace…',
          shortcut: 'Mod+H',
          enabled: !state.readOnly,
          onSelect: actions.replace,
        },
        { id: 'go-to-line', label: 'Go to Line…', shortcut: 'Mod+G', onSelect: actions.goToLine },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'word-wrap',
          type: 'checkbox',
          label: 'Word Wrap',
          checked: state.wordWrap,
          onSelect: actions.toggleWordWrap,
        },
        {
          id: 'line-numbers',
          type: 'checkbox',
          label: 'Line Numbers',
          checked: state.lineNumbers,
          onSelect: actions.toggleLineNumbers,
        },
        {
          id: 'preview',
          type: 'checkbox',
          label: 'Markdown Preview',
          shortcut: 'Shift+Mod+P',
          checked: state.preview,
          enabled: state.isMarkdown,
          onSelect: actions.togglePreview,
        },
        separator,
        { id: 'zoom-in', label: 'Bigger', shortcut: 'Mod+=', onSelect: actions.zoomIn },
        { id: 'zoom-out', label: 'Smaller', shortcut: 'Mod+-', onSelect: actions.zoomOut },
        { id: 'zoom-reset', label: 'Actual Size', shortcut: 'Mod+0', onSelect: actions.zoomReset },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ id: 'help', label: 'Text Editor Help', onSelect: actions.help }],
    },
  ];
}

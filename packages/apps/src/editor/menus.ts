/**
 * The menubar for the editor window. Built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';

export interface EditorMenuState {
  hasPath: boolean;
  readOnly: boolean;
  /**
   * Focus is in the find or replace field. The Edit commands belong to the
   * document, so they stand down and let the browser edit the field.
   */
  fieldFocused: boolean;
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
      label: t('menu.file'),
      items: [
        { id: 'new', label: t('menu.new'), shortcut: 'Mod+N', onSelect: actions.newWindow },
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
          enabled: state.canUndo && !state.readOnly && !state.fieldFocused,
          onSelect: actions.undo,
        },
        {
          id: 'redo',
          label: t('menu.redo'),
          shortcut: 'Shift+Mod+Z',
          enabled: state.canRedo && !state.readOnly && !state.fieldFocused,
          onSelect: actions.redo,
        },
        separator,
        {
          id: 'cut',
          label: t('action.cut'),
          shortcut: 'Mod+X',
          enabled: state.hasSelection && !state.readOnly && !state.fieldFocused,
          onSelect: actions.cut,
        },
        {
          id: 'copy',
          label: t('action.copy'),
          shortcut: 'Mod+C',
          enabled: state.hasSelection && !state.fieldFocused,
          onSelect: actions.copy,
        },
        {
          id: 'paste',
          label: t('action.paste'),
          shortcut: 'Mod+V',
          enabled: !state.readOnly && !state.fieldFocused,
          onSelect: actions.paste,
        },
        {
          id: 'select-all',
          label: t('menu.selectAll'),
          shortcut: 'Mod+A',
          enabled: !state.fieldFocused,
          onSelect: actions.selectAll,
        },
        separator,
        { id: 'find', label: t('menu.findEllipsis'), shortcut: 'Mod+F', onSelect: actions.find },
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
      label: t('menu.view'),
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
        {
          id: 'zoom-reset',
          label: t('menu.actualSize'),
          shortcut: 'Mod+0',
          onSelect: actions.zoomReset,
        },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [{ id: 'help', label: 'Text Editor Help', onSelect: actions.help }],
    },
  ];
}

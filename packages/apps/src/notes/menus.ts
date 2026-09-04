/**
 * The menubar for the Notes window, built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { SORT_LABELS, type SortKey, VIEW_LABELS, type ViewMode } from './notes';
import type { InlineFormat, ListStyle } from './wrap';

export interface NotesMenuState {
  hasNote: boolean;
  pinned: boolean;
  view: ViewMode;
  sort: SortKey;
  showTags: boolean;
  /**
   * The caret is in the search field, not the note. The Format commands belong
   * to the document, so they stand down and let the field take the keys.
   */
  searchFocused: boolean;
}

export interface NotesActions {
  newNote: () => void;
  duplicate: () => void;
  rename: () => void;
  togglePin: () => void;
  moveToTrash: () => void;
  exportMarkdown: () => void;
  exportText: () => void;
  close: () => void;
  find: () => void;
  setView: (mode: ViewMode) => void;
  setSort: (sort: SortKey) => void;
  toggleTags: () => void;
  format: (format: InlineFormat) => void;
  link: () => void;
  heading: (level: number) => void;
  list: (style: ListStyle) => void;
  help: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

const SORT_KEYS: SortKey[] = ['modified', 'created', 'title'];
const VIEW_SHORTCUTS: Record<ViewMode, string> = {
  edit: 'Shift+Mod+E',
  preview: 'Shift+Mod+P',
  split: 'Shift+Mod+D',
};

export function buildNotesMenus(state: NotesMenuState, actions: NotesActions): MenuTemplate[] {
  const editable = state.hasNote && !state.searchFocused;
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New Note', shortcut: 'Mod+N', onSelect: actions.newNote },
        {
          id: 'duplicate',
          label: 'Duplicate',
          shortcut: 'Mod+D',
          enabled: state.hasNote,
          onSelect: actions.duplicate,
        },
        {
          id: 'rename',
          label: 'Rename…',
          shortcut: 'Mod+R',
          enabled: state.hasNote,
          onSelect: actions.rename,
        },
        {
          id: 'pin',
          type: 'checkbox',
          label: 'Pin to Top',
          shortcut: 'Mod+P',
          checked: state.pinned,
          enabled: state.hasNote,
          onSelect: actions.togglePin,
        },
        separator,
        {
          id: 'export-markdown',
          label: 'Export as Markdown…',
          enabled: state.hasNote,
          onSelect: actions.exportMarkdown,
        },
        {
          id: 'export-text',
          label: 'Export as Plain Text…',
          enabled: state.hasNote,
          onSelect: actions.exportText,
        },
        separator,
        {
          id: 'trash',
          label: 'Move to Trash',
          shortcut: 'Mod+Backspace',
          danger: true,
          enabled: state.hasNote,
          onSelect: actions.moveToTrash,
        },
        separator,
        { id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [{ id: 'find', label: 'Find…', shortcut: 'Mod+F', onSelect: actions.find }],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...(['edit', 'preview', 'split'] as ViewMode[]).map<MenuItemTemplate>((mode) => ({
          id: `view-${mode}`,
          type: 'radio',
          label: VIEW_LABELS[mode],
          shortcut: VIEW_SHORTCUTS[mode],
          checked: state.view === mode,
          onSelect: () => actions.setView(mode),
        })),
        separator,
        {
          id: 'sort',
          type: 'submenu',
          label: 'Sort By',
          submenu: SORT_KEYS.map<MenuItemTemplate>((key) => ({
            id: `sort-${key}`,
            type: 'radio',
            label: SORT_LABELS[key],
            checked: state.sort === key,
            onSelect: () => actions.setSort(key),
          })),
        },
        separator,
        {
          id: 'show-tags',
          type: 'checkbox',
          label: 'Show Tags',
          checked: state.showTags,
          onSelect: actions.toggleTags,
        },
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
          enabled: editable,
          onSelect: () => actions.format('bold'),
        },
        {
          id: 'italic',
          label: 'Italic',
          shortcut: 'Mod+I',
          enabled: editable,
          onSelect: () => actions.format('italic'),
        },
        {
          id: 'strike',
          label: 'Strikethrough',
          shortcut: 'Shift+Mod+X',
          enabled: editable,
          onSelect: () => actions.format('strike'),
        },
        {
          id: 'code',
          label: 'Code',
          shortcut: 'Mod+E',
          enabled: editable,
          onSelect: () => actions.format('code'),
        },
        {
          id: 'link',
          label: 'Link',
          shortcut: 'Mod+K',
          enabled: editable,
          onSelect: actions.link,
        },
        separator,
        {
          id: 'heading',
          type: 'submenu',
          label: 'Heading',
          enabled: editable,
          submenu: [
            {
              id: 'heading-1',
              label: 'Level 1',
              shortcut: 'Mod+1',
              enabled: editable,
              onSelect: () => actions.heading(1),
            },
            {
              id: 'heading-2',
              label: 'Level 2',
              shortcut: 'Mod+2',
              enabled: editable,
              onSelect: () => actions.heading(2),
            },
            {
              id: 'heading-3',
              label: 'Level 3',
              shortcut: 'Mod+3',
              enabled: editable,
              onSelect: () => actions.heading(3),
            },
            {
              id: 'heading-0',
              label: 'Body Text',
              shortcut: 'Mod+0',
              enabled: editable,
              onSelect: () => actions.heading(0),
            },
          ],
        },
        {
          id: 'list',
          type: 'submenu',
          label: 'List',
          enabled: editable,
          submenu: [
            {
              id: 'list-bullet',
              label: 'Bulleted',
              shortcut: 'Shift+Mod+L',
              enabled: editable,
              onSelect: () => actions.list('bullet'),
            },
            {
              id: 'list-number',
              label: 'Numbered',
              shortcut: 'Shift+Mod+O',
              enabled: editable,
              onSelect: () => actions.list('number'),
            },
            {
              id: 'list-task',
              label: 'Task',
              shortcut: 'Shift+Mod+T',
              enabled: editable,
              onSelect: () => actions.list('task'),
            },
          ],
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ id: 'help', label: 'Notes Help', onSelect: actions.help }],
    },
  ];
}

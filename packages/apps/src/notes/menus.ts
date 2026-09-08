/**
 * The menubar for the Notes window, built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';
import { SORT_LABELS, type SortKey, VIEW_LABELS, type ViewMode } from './library';
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
      label: t('menu.file'),
      items: [
        { id: 'new', label: t('notes.newNote'), shortcut: 'Mod+N', onSelect: actions.newNote },
        {
          id: 'duplicate',
          label: t('menu.duplicate'),
          shortcut: 'Mod+D',
          enabled: state.hasNote,
          onSelect: actions.duplicate,
        },
        {
          id: 'rename',
          label: t('menu.renameEllipsis'),
          shortcut: 'Mod+R',
          enabled: state.hasNote,
          onSelect: actions.rename,
        },
        {
          id: 'pin',
          type: 'checkbox',
          label: t('notes.pinToTop'),
          shortcut: 'Mod+P',
          checked: state.pinned,
          enabled: state.hasNote,
          onSelect: actions.togglePin,
        },
        separator,
        {
          id: 'export-markdown',
          label: t('menu.exportMarkdown'),
          enabled: state.hasNote,
          onSelect: actions.exportMarkdown,
        },
        {
          id: 'export-text',
          label: t('menu.exportPlainText'),
          enabled: state.hasNote,
          onSelect: actions.exportText,
        },
        separator,
        {
          id: 'trash',
          label: t('notes.moveToTrash'),
          shortcut: 'Mod+Backspace',
          danger: true,
          enabled: state.hasNote,
          onSelect: actions.moveToTrash,
        },
        separator,
        { id: 'close', label: t('menu.close'), shortcut: 'Mod+W', onSelect: actions.close },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        { id: 'find', label: t('menu.findEllipsis'), shortcut: 'Mod+F', onSelect: actions.find },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
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
          label: t('menu.sortBy'),
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
          label: t('notes.showTags'),
          checked: state.showTags,
          onSelect: actions.toggleTags,
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
          enabled: editable,
          onSelect: () => actions.format('bold'),
        },
        {
          id: 'italic',
          label: t('menu.italic'),
          shortcut: 'Mod+I',
          enabled: editable,
          onSelect: () => actions.format('italic'),
        },
        {
          id: 'strike',
          label: t('notes.strikethrough'),
          shortcut: 'Shift+Mod+X',
          enabled: editable,
          onSelect: () => actions.format('strike'),
        },
        {
          id: 'code',
          label: t('notes.code'),
          shortcut: 'Mod+E',
          enabled: editable,
          onSelect: () => actions.format('code'),
        },
        {
          id: 'link',
          label: t('notes.link'),
          shortcut: 'Mod+K',
          enabled: editable,
          onSelect: actions.link,
        },
        separator,
        {
          id: 'heading',
          type: 'submenu',
          label: t('notes.heading'),
          enabled: editable,
          submenu: [
            {
              id: 'heading-1',
              label: t('notes.level1'),
              shortcut: 'Mod+1',
              enabled: editable,
              onSelect: () => actions.heading(1),
            },
            {
              id: 'heading-2',
              label: t('notes.level2'),
              shortcut: 'Mod+2',
              enabled: editable,
              onSelect: () => actions.heading(2),
            },
            {
              id: 'heading-3',
              label: t('notes.level3'),
              shortcut: 'Mod+3',
              enabled: editable,
              onSelect: () => actions.heading(3),
            },
            {
              id: 'heading-0',
              label: t('notes.bodyText'),
              shortcut: 'Mod+0',
              enabled: editable,
              onSelect: () => actions.heading(0),
            },
          ],
        },
        {
          id: 'list',
          type: 'submenu',
          label: t('notes.list'),
          enabled: editable,
          submenu: [
            {
              id: 'list-bullet',
              label: t('notes.bulleted'),
              shortcut: 'Shift+Mod+L',
              enabled: editable,
              onSelect: () => actions.list('bullet'),
            },
            {
              id: 'list-number',
              label: t('notes.numbered'),
              shortcut: 'Shift+Mod+O',
              enabled: editable,
              onSelect: () => actions.list('number'),
            },
            {
              id: 'list-task',
              label: t('notes.task'),
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
      label: t('menu.help'),
      items: [{ id: 'help', label: t('notes.help'), onSelect: actions.help }],
    },
  ];
}

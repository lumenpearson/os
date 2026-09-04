/**
 * The menubar for a Slides window. Built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { LAYOUT_LABELS, SLIDE_LAYOUTS, type SlideLayout } from './deck';

export interface SlidesMenuState {
  hasSlides: boolean;
  canUndo: boolean;
  canRedo: boolean;
  notesOpen: boolean;
  thumbnailsOpen: boolean;
  layout: SlideLayout | null;
}

export interface SlidesActions {
  newDeck: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  exportHtml: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  renameDeck: () => void;
  newSlide: () => void;
  setLayout: (layout: SlideLayout) => void;
  duplicate: () => void;
  remove: () => void;
  toggleNotes: () => void;
  toggleThumbnails: () => void;
  present: () => void;
  help: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildSlidesMenus(state: SlidesMenuState, actions: SlidesActions): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New Presentation', shortcut: 'Mod+N', onSelect: actions.newDeck },
        { id: 'open', label: 'Open…', shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        { id: 'save', label: 'Save', shortcut: 'Mod+S', onSelect: actions.save },
        { id: 'save-as', label: 'Save As…', shortcut: 'Shift+Mod+S', onSelect: actions.saveAs },
        {
          id: 'export-html',
          label: 'Export as HTML…',
          enabled: state.hasSlides,
          onSelect: actions.exportHtml,
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
        { id: 'rename', label: 'Presentation Title…', onSelect: actions.renameDeck },
      ],
    },
    {
      id: 'slide',
      label: 'Slide',
      items: [
        {
          id: 'new-slide',
          label: 'New Slide',
          shortcut: 'Shift+Mod+N',
          onSelect: actions.newSlide,
        },
        {
          id: 'duplicate',
          label: 'Duplicate Slide',
          shortcut: 'Mod+D',
          enabled: state.hasSlides,
          onSelect: actions.duplicate,
        },
        {
          id: 'delete',
          label: 'Delete Slide',
          enabled: state.hasSlides,
          danger: true,
          onSelect: actions.remove,
        },
        separator,
        {
          id: 'layout',
          type: 'submenu',
          label: 'Layout',
          enabled: state.hasSlides,
          submenu: SLIDE_LAYOUTS.map((layout) => ({
            id: `layout-${layout}`,
            type: 'radio',
            label: LAYOUT_LABELS[layout],
            checked: state.layout === layout,
            onSelect: () => actions.setLayout(layout),
          })),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'thumbnails',
          type: 'checkbox',
          label: 'Thumbnails',
          checked: state.thumbnailsOpen,
          onSelect: actions.toggleThumbnails,
        },
        {
          id: 'notes',
          type: 'checkbox',
          label: 'Notes Panel',
          shortcut: 'Shift+Mod+I',
          checked: state.notesOpen,
          onSelect: actions.toggleNotes,
        },
        separator,
        {
          id: 'present',
          label: 'Present',
          shortcut: 'F5',
          enabled: state.hasSlides,
          onSelect: actions.present,
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ id: 'help', label: 'Slides Help', onSelect: actions.help }],
    },
  ];
}

/**
 * The menubar for a Slides window. Built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { t } from '@lumen/kernel';
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
      label: t('menu.file'),
      items: [
        {
          id: 'new',
          label: t('slides.newPresentation'),
          shortcut: 'Mod+N',
          onSelect: actions.newDeck,
        },
        { id: 'open', label: t('menu.open'), shortcut: 'Mod+O', onSelect: actions.open },
        separator,
        { id: 'save', label: t('menu.save'), shortcut: 'Mod+S', onSelect: actions.save },
        {
          id: 'save-as',
          label: t('menu.saveAs'),
          shortcut: 'Shift+Mod+S',
          onSelect: actions.saveAs,
        },
        {
          id: 'export-html',
          label: t('menu.exportHtml'),
          enabled: state.hasSlides,
          onSelect: actions.exportHtml,
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
        separator,
        { id: 'rename', label: t('slides.presentationTitle'), onSelect: actions.renameDeck },
      ],
    },
    {
      id: 'slide',
      label: t('slides.slide'),
      items: [
        {
          id: 'new-slide',
          label: t('slides.newSlide'),
          shortcut: 'Shift+Mod+N',
          onSelect: actions.newSlide,
        },
        {
          id: 'duplicate',
          label: t('slides.duplicateSlide'),
          shortcut: 'Mod+D',
          enabled: state.hasSlides,
          onSelect: actions.duplicate,
        },
        {
          id: 'delete',
          label: t('slides.deleteSlide'),
          enabled: state.hasSlides,
          danger: true,
          onSelect: actions.remove,
        },
        separator,
        {
          id: 'layout',
          type: 'submenu',
          label: t('slides.layout'),
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
      label: t('menu.view'),
      items: [
        {
          id: 'thumbnails',
          type: 'checkbox',
          label: t('slides.thumbnails'),
          checked: state.thumbnailsOpen,
          onSelect: actions.toggleThumbnails,
        },
        {
          id: 'notes',
          type: 'checkbox',
          label: t('slides.notesPanel'),
          shortcut: 'Shift+Mod+I',
          checked: state.notesOpen,
          onSelect: actions.toggleNotes,
        },
        separator,
        {
          id: 'present',
          label: t('slides.present'),
          shortcut: 'F5',
          enabled: state.hasSlides,
          onSelect: actions.present,
        },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [{ id: 'help', label: t('slides.help'), onSelect: actions.help }],
    },
  ];
}

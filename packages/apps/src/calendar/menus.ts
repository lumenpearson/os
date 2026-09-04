/**
 * The menubar for the Calendar window, built from one snapshot of state so a
 * command reads the same whether it is clicked or typed as a shortcut.
 */
import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { type CalendarView, VIEW_LABELS, VIEW_SHORTCUTS, VIEWS } from './view';

export interface CalendarMenuState {
  view: CalendarView;
  /** An event is selected, so the commands that act on one are live. */
  hasSelection: boolean;
  showSidebar: boolean;
}

export interface CalendarActions {
  newEvent: () => void;
  editEvent: () => void;
  deleteEvent: () => void;
  close: () => void;
  find: () => void;
  setView: (view: CalendarView) => void;
  today: () => void;
  next: () => void;
  previous: () => void;
  toggleSidebar: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildCalendarMenus(
  state: CalendarMenuState,
  actions: CalendarActions,
): MenuTemplate[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new-event', label: 'New Event', shortcut: 'Mod+N', onSelect: actions.newEvent },
        {
          id: 'edit-event',
          label: 'Edit Event…',
          shortcut: 'Mod+E',
          enabled: state.hasSelection,
          onSelect: actions.editEvent,
        },
        separator,
        {
          id: 'delete-event',
          label: 'Delete Event',
          shortcut: 'Delete',
          danger: true,
          enabled: state.hasSelection,
          onSelect: actions.deleteEvent,
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
        ...VIEWS.map<MenuItemTemplate>((view) => ({
          id: `view-${view}`,
          type: 'radio',
          label: VIEW_LABELS[view],
          shortcut: VIEW_SHORTCUTS[view],
          checked: state.view === view,
          onSelect: () => actions.setView(view),
        })),
        separator,
        { id: 'today', label: 'Today', shortcut: 'Mod+T', onSelect: actions.today },
        { id: 'previous', label: 'Previous', shortcut: 'Mod+[', onSelect: actions.previous },
        { id: 'next', label: 'Next', shortcut: 'Mod+]', onSelect: actions.next },
        separator,
        {
          id: 'sidebar',
          type: 'checkbox',
          label: 'Sidebar',
          shortcut: 'Shift+Mod+S',
          checked: state.showSidebar,
          onSelect: actions.toggleSidebar,
        },
      ],
    },
  ];
}

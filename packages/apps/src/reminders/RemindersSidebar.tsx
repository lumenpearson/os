import { AnchoredMenu, Button, type MenuEntry, Sidebar, type SidebarSection } from '@lumen/ui';
import {
  CalendarClock,
  CalendarDays,
  CheckCheck,
  Flag,
  Inbox,
  List as ListGlyph,
  Plus,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { SIDEBAR_WIDTH } from './layout';
import { type Selection, SMART_LABELS, SMART_LISTS, type SmartListId, selectionId } from './smart';
import type { ReminderList } from './store';

const SMART_ICONS: Record<SmartListId, ReactNode> = {
  today: <CalendarDays />,
  scheduled: <CalendarClock />,
  flagged: <Flag />,
  all: <Inbox />,
  completed: <CheckCheck />,
};

export interface RemindersSidebarProps {
  lists: ReminderList[];
  selection: Selection;
  smartCounts: Record<SmartListId, number>;
  listCounts: Record<string, number>;
  onSelect: (selection: Selection) => void;
  onNewList: () => void;
  onRenameList: (id: string) => void;
  onDeleteList: (id: string) => void;
}

/** Smart lists above, the user's own lists below, one new-list button under. */
export function RemindersSidebar({
  lists,
  selection,
  smartCounts,
  listCounts,
  onSelect,
  onNewList,
  onRenameList,
  onDeleteList,
}: RemindersSidebarProps) {
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);

  const sections: SidebarSection[] = [
    {
      id: 'smart',
      title: 'Lists',
      items: SMART_LISTS.map((id) => ({
        id: selectionId({ kind: 'smart', id }),
        label: SMART_LABELS[id],
        icon: SMART_ICONS[id],
        meta: smartCounts[id] > 0 ? String(smartCounts[id]) : undefined,
        onSelect: () => onSelect({ kind: 'smart', id }),
      })),
    },
    {
      id: 'user',
      title: 'My Lists',
      items: lists.map((list) => ({
        id: selectionId({ kind: 'list', id: list.id }),
        label: list.name,
        icon: <ListGlyph />,
        meta: (listCounts[list.id] ?? 0) > 0 ? String(listCounts[list.id]) : undefined,
        onSelect: () => onSelect({ kind: 'list', id: list.id }),
        onContextMenu: (event: React.MouseEvent) => {
          event.preventDefault();
          setMenuFor({ id: list.id, x: event.clientX, y: event.clientY });
        },
      })),
    },
  ];

  const entries: MenuEntry[] = [
    {
      id: 'rename',
      label: 'Rename List…',
      onSelect: () => menuFor && onRenameList(menuFor.id),
    },
    {
      id: 'delete',
      label: 'Delete List',
      danger: true,
      onSelect: () => menuFor && onDeleteList(menuFor.id),
    },
  ];

  return (
    <>
      <Sidebar
        sections={sections}
        activeId={selectionId(selection)}
        width={SIDEBAR_WIDTH}
        footer={
          <div className="border-t border-rule p-2">
            <Button
              size="sm"
              variant="ghost"
              block
              icon={<Plus className="size-3.5" />}
              onClick={onNewList}
              className="justify-start"
            >
              New List
            </Button>
          </div>
        }
      />
      <AnchoredMenu
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
        items={entries}
        at={menuFor ? { x: menuFor.x, y: menuFor.y } : undefined}
      />
    </>
  );
}

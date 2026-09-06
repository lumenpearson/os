import { Button, Sidebar, type SidebarSection } from '@lumen/ui';
import { Archive, Ban, Folder, FolderPlus, Inbox, PenLine, Send, Trash2 } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import {
  MAILBOX_LABELS,
  type MailboxCount,
  type MailData,
  SYSTEM_MAILBOXES,
  type SystemMailbox,
} from './store';

const GLYPHS: Record<SystemMailbox, ReactNode> = {
  inbox: <Inbox />,
  drafts: <PenLine />,
  sent: <Send />,
  archive: <Archive />,
  junk: <Ban />,
  trash: <Trash2 />,
};

export interface MailboxSidebarProps {
  data: MailData;
  counts: Record<string, MailboxCount>;
  active: string;
  width: number;
  onSelect: (id: string) => void;
  onNewFolder: () => void;
  onFolderMenu: (id: string, event: MouseEvent) => void;
  className?: string;
}

/**
 * Mailboxes down the left. The count on a row is what is unread, except in
 * Drafts, where everything is yours already and the number that matters is
 * how many are waiting.
 */
export function MailboxSidebar({
  data,
  counts,
  active,
  width,
  onSelect,
  onNewFolder,
  onFolderMenu,
  className,
}: MailboxSidebarProps) {
  const meta = (id: string, drafts = false) => {
    const count = counts[id];
    if (!count) return undefined;
    if (drafts) return count.total > 0 ? String(count.total) : undefined;
    return count.unread > 0 ? String(count.unread) : undefined;
  };

  const sections: SidebarSection[] = [
    {
      id: 'mailboxes',
      title: 'Mailboxes',
      items: SYSTEM_MAILBOXES.map((id) => ({
        id,
        label: MAILBOX_LABELS[id],
        icon: GLYPHS[id],
        meta: meta(id, id === 'drafts'),
        onSelect: () => onSelect(id),
      })),
    },
  ];
  if (data.folders.length > 0) {
    sections.push({
      id: 'folders',
      title: 'Folders',
      items: data.folders.map((folder) => ({
        id: folder.id,
        label: folder.name,
        icon: <Folder />,
        meta: meta(folder.id),
        onSelect: () => onSelect(folder.id),
        onContextMenu: (event: MouseEvent) => onFolderMenu(folder.id, event),
      })),
    });
  }

  return (
    <Sidebar
      sections={sections}
      activeId={active}
      width={width}
      className={className}
      footer={
        <div className="flex flex-col gap-2 border-t border-rule px-2 py-2">
          <Button
            size="sm"
            variant="ghost"
            block
            className="justify-start"
            icon={<FolderPlus className="size-3.5" />}
            onClick={onNewFolder}
          >
            New Folder
          </Button>
          <p className="px-1 pb-0.5 text-xs leading-normal text-ink-3">
            This mailbox is a file on this computer. Nothing is sent or received over a network.
          </p>
        </div>
      }
    />
  );
}

import { Sidebar, type SidebarSection } from '@lumen/ui';
import {
  BadgePercent,
  CircleUser,
  Download,
  FolderDown,
  Grid2x2,
  Layers,
  Receipt,
  RefreshCw,
  Settings2,
  Sparkles,
  Tag,
} from 'lucide-react';
import { SECTION_GROUPS, SECTIONS, type SectionId } from './menus';

/**
 * The store's places, down the left edge.
 *
 * A segmented control held three of them and had nowhere to put the rest —
 * the plan, the subscription, the receipts, the collections the catalogue
 * already ships. A sidebar is the shape that scales: a band per kind of
 * question, and a count beside the two answers that change on their own.
 */
const ICONS: Record<SectionId, typeof Sparkles> = {
  discover: Sparkles,
  categories: Grid2x2,
  collections: Layers,
  deals: BadgePercent,
  installed: Download,
  updates: RefreshCw,
  account: CircleUser,
  subscription: Tag,
  purchases: Receipt,
  settings: Settings2,
  install: FolderDown,
};

export interface StoreSidebarProps {
  section: SectionId;
  onSection: (section: SectionId) => void;
  /** Installed apps, shown beside Installed. */
  installed: number;
  /** Updates waiting, shown beside Updates — and only when there are any. */
  updates: number;
}

export function storeSidebarSections({
  onSection,
  installed,
  updates,
}: Omit<StoreSidebarProps, 'section'>): SidebarSection[] {
  // A band with nothing in it is a heading over empty space. The sections
  // arrive one commit at a time, so a band waits for its first one.
  return SECTION_GROUPS.filter((group) => SECTIONS.some((s) => s.group === group.id)).map(
    (group) => ({
      id: group.id,
      title: group.title,
      items: SECTIONS.filter((s) => s.group === group.id).map((s) => {
        const Icon = ICONS[s.id];
        return {
          id: s.id,
          label: s.label,
          icon: <Icon />,
          // A number that is always there stops being read. These two move on
          // their own, so they are worth a glance; zero updates is not news.
          meta:
            s.id === 'installed'
              ? String(installed)
              : s.id === 'updates' && updates > 0
                ? String(updates)
                : undefined,
          onSelect: () => onSection(s.id),
        };
      }),
    }),
  );
}

export function StoreSidebar({ section, onSection, installed, updates }: StoreSidebarProps) {
  return (
    <Sidebar
      width={188}
      activeId={section}
      sections={storeSidebarSections({ onSection, installed, updates })}
    />
  );
}

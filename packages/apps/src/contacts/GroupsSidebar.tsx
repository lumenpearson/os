/**
 * The groups sidebar: the whole book, the starred cards, and every group any
 * contact belongs to. Groups are not a separate list to maintain — they are
 * whatever the cards say, which is also what CATEGORIES means in a vCard.
 */

import { Sidebar, type SidebarSection } from '@lumen/ui';
import { Star, Tag, Users } from 'lucide-react';
import type { GroupCount } from './contact';
import { FAVOURITES } from './contact';
import { SIDEBAR_WIDTH } from './layout';

export interface GroupsSidebarProps {
  groups: GroupCount[];
  /** null is the whole book. */
  selected: string | null;
  total: number;
  favourites: number;
  onSelect: (group: string | null) => void;
}

const ALL = 'all';

export function GroupsSidebar({
  groups,
  selected,
  total,
  favourites,
  onSelect,
}: GroupsSidebarProps) {
  const sections: SidebarSection[] = [
    {
      id: 'book',
      items: [
        {
          id: ALL,
          label: 'All Contacts',
          icon: <Users />,
          meta: String(total),
          onSelect: () => onSelect(null),
        },
        {
          id: FAVOURITES,
          label: 'Favourites',
          icon: <Star />,
          meta: String(favourites),
          onSelect: () => onSelect(FAVOURITES),
        },
      ],
    },
  ];

  if (groups.length > 0) {
    sections.push({
      id: 'groups',
      title: 'Groups',
      items: groups.map((group) => ({
        id: group.name,
        label: group.name,
        icon: <Tag />,
        meta: String(group.count),
        onSelect: () => onSelect(group.name),
      })),
    });
  }

  return <Sidebar sections={sections} activeId={selected ?? ALL} width={SIDEBAR_WIDTH} />;
}

import { Sidebar, type SidebarSection } from '@lumen/ui';
import { Hash, NotebookText } from 'lucide-react';
import type { TagCount } from './notes';

export interface TagRailProps {
  tags: readonly TagCount[];
  activeTag: string | null;
  total: number;
  onSelect: (tag: string | null) => void;
  width?: number;
}

function Count({ value }: { value: number }) {
  return <span className="mono text-2xs tabular-nums text-ink-3">{value}</span>;
}

/** The left rail: every note, then the tags found in them, with counts. */
export function TagRail({ tags, activeTag, total, onSelect, width = 172 }: TagRailProps) {
  const sections: SidebarSection[] = [
    {
      id: 'library',
      items: [
        {
          id: 'all',
          label: 'All Notes',
          icon: <NotebookText />,
          meta: <Count value={total} />,
          onSelect: () => onSelect(null),
        },
      ],
    },
  ];
  if (tags.length > 0) {
    sections.push({
      id: 'tags',
      title: 'Tags',
      items: tags.map((t) => ({
        id: `tag:${t.tag.toLowerCase()}`,
        label: t.tag,
        icon: <Hash />,
        meta: <Count value={t.count} />,
        onSelect: () => onSelect(t.tag),
      })),
    });
  }

  return (
    <Sidebar
      sections={sections}
      width={width}
      activeId={activeTag ? `tag:${activeTag.toLowerCase()}` : 'all'}
      footer={
        tags.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-ink-3">
            Write <span className="mono">#tag</span> in a note to file it here.
          </p>
        ) : undefined
      }
    />
  );
}

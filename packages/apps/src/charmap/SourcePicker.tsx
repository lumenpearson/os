/**
 * Choosing what the grid shows: the two lists the person builds, then the
 * blocks. A list down the side when the window is wide enough to spare 210
 * pixels for it, and the same choice as a select in the toolbar when it is
 * not — the window is not a page, and it can be 380 pixels across.
 */

import { Select, Sidebar } from '@lumen/ui';
import { useMemo } from 'react';
import { BLOCKS } from './blocks';
import { PINNED_SOURCE, RECENT_SOURCE, type SourceId } from './storage';

export interface SourcePickerProps {
  value: SourceId;
  onChange: (id: SourceId) => void;
  pinnedCount: number;
  recentCount: number;
}

export function SourceSidebar({ value, onChange, pinnedCount, recentCount }: SourcePickerProps) {
  const sections = useMemo(
    () => [
      {
        id: 'lists',
        items: [
          {
            id: PINNED_SOURCE,
            label: 'Pinned',
            meta: pinnedCount > 0 ? String(pinnedCount) : undefined,
            onSelect: () => onChange(PINNED_SOURCE),
          },
          {
            id: RECENT_SOURCE,
            label: 'Recent',
            meta: recentCount > 0 ? String(recentCount) : undefined,
            onSelect: () => onChange(RECENT_SOURCE),
          },
        ],
      },
      {
        id: 'blocks',
        title: 'Blocks',
        items: BLOCKS.map((block) => ({
          id: block.id,
          label: block.name,
          onSelect: () => onChange(block.id),
        })),
      },
    ],
    [onChange, pinnedCount, recentCount],
  );
  return <Sidebar sections={sections} activeId={value} width={210} />;
}

const OPTIONS = [
  { value: PINNED_SOURCE, label: 'Pinned' },
  { value: RECENT_SOURCE, label: 'Recent' },
  ...BLOCKS.map((block) => ({ value: block.id, label: block.name })),
];

export function SourceSelect({
  value,
  onChange,
  className,
}: Pick<SourcePickerProps, 'value' | 'onChange'> & { className?: string }) {
  return (
    <Select
      aria-label="Block"
      size="sm"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}

/** Opens Spotlight — the same overlay the menubar's magnifier and Ctrl+Space open. */

import { cx, Tooltip } from '@lumen/ui';
import { Search } from 'lucide-react';
import { useShellStore } from '../../shellStore';
import { groupClass, ITEM_BUTTON, type TaskbarItemProps, tooltipSide } from './types';

export function SearchItem({ size, vertical, position }: TaskbarItemProps) {
  const open = useShellStore((s) => s.spotlight);
  const toggle = useShellStore((s) => s.toggle);
  return (
    <div data-taskbar-item="search" className={groupClass(vertical)}>
      <Tooltip content="Search" side={tooltipSide(position)}>
        <button
          type="button"
          aria-label="Search"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="taskbar-search"
          data-taskbar-icon=""
          onClick={() => toggle('spotlight')}
          className={cx(ITEM_BUTTON, open ? 'bg-selection text-accent' : 'hover:bg-surface-2/70')}
          style={{ width: size, height: size }}
        >
          <span
            data-taskbar-glyph=""
            className={cx(
              'flex items-center justify-center',
              position === 'bottom' && 'origin-bottom',
              position === 'left' && 'origin-left',
              position === 'right' && 'origin-right',
            )}
          >
            <Search size={Math.round(size * 0.44)} strokeWidth={1.75} />
          </span>
        </button>
      </Tooltip>
    </div>
  );
}

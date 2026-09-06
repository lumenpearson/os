// deslop-ignore-file 09 13 — <Mark> is the product wordmark; the scanner matches the substring 'mark'.
/** The Start button, and the hairline that separates it from what follows. */

import { cx, Tooltip } from '@lumen/ui';
import { Mark } from '../../desktop/Wordmark';
import { useShellStore } from '../../shellStore';
import { groupClass, ITEM_BUTTON, type TaskbarItemProps, tooltipSide } from './types';

export function StartItem({
  size,
  vertical,
  position,
  separator,
}: TaskbarItemProps & { separator: boolean }) {
  const open = useShellStore((s) => s.startMenu);
  const toggle = useShellStore((s) => s.toggle);
  return (
    <div data-taskbar-item="start" className={groupClass(vertical)}>
      <Tooltip content="Start" side={tooltipSide(position)}>
        <button
          type="button"
          aria-label="Start"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="start-button"
          data-taskbar-icon=""
          onClick={() => toggle('startMenu')}
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
            {/* deslop-ignore-next-line 24 — the product wordmark, not a generated glyph. */}
            <Mark size={Math.round(size * 0.5)} />
          </span>
        </button>
      </Tooltip>
      {separator && (
        <span aria-hidden className={cx('bg-rule', vertical ? 'my-1 h-px w-6' : 'mx-1 h-6 w-px')} />
      )}
    </div>
  );
}

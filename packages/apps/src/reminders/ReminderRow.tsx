import { Checkbox, cx, IconButton } from '@lumen/ui';
import { Flag, Repeat as RepeatGlyph, SquarePen } from 'lucide-react';
import { type DateKey, type FormatOptions, formatDue, isOverdue } from './date';
import type { Row } from './smart';
import { describeRepeat, displayTitle, PRIORITY_MARKS } from './store';

export interface ReminderRowProps {
  row: Row;
  focused: boolean;
  /** Tab reaches exactly one row; the arrows move from there. */
  tabbable: boolean;
  /** The list a reminder came from, printed only in the smart lists. */
  listName: string | null;
  today: DateKey;
  o: FormatOptions;
  onFocus: () => void;
  onToggleCompleted: () => void;
  onToggleFlagged: () => void;
  onOpen: () => void;
}

/** One reminder: a box to tick, what it says, and when it is due. */
export function ReminderRow({
  row,
  focused,
  tabbable,
  listName,
  today,
  o,
  onFocus,
  onToggleCompleted,
  onToggleFlagged,
  onOpen,
}: ReminderRowProps) {
  const { item, depth } = row;
  const title = displayTitle(item);
  const overdue = !item.completed && isOverdue(item.due, today);
  const marks = PRIORITY_MARKS[item.priority];
  const repeat = describeRepeat(item.repeat);
  const meta = item.due !== null || repeat || listName;

  return (
    <div
      role="option"
      aria-selected={focused}
      data-row={item.id}
      tabIndex={tabbable ? 0 : -1}
      onFocus={onFocus}
      onDoubleClick={onOpen}
      className={cx(
        'group flex items-start gap-2 rounded-sm border border-transparent px-2 py-1.5 lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        focused ? 'bg-selection' : 'hover:bg-surface-2',
      )}
      style={{ marginLeft: depth * 24 }}
    >
      <Checkbox
        tabIndex={-1}
        checked={item.completed}
        onChange={onToggleCompleted}
        aria-label={item.completed ? `Mark ${title} as not completed` : `Complete ${title}`}
        className="mt-px shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {marks && (
            <span className="mono shrink-0 text-sm text-accent" aria-hidden>
              {marks}
            </span>
          )}
          {/* A ticked box and grey text already say it is done; a strike
              through the words as well would be one signal too many. */}
          <span className={cx('truncate-1 text-base', item.completed ? 'text-ink-3' : 'text-ink')}>
            {title}
          </span>
        </div>
        {item.notes.trim() && (
          <span className="truncate-1 text-sm text-ink-2">{item.notes.trim()}</span>
        )}
        {meta && (
          <div className="flex min-w-0 items-center gap-2.5">
            {item.due !== null && (
              <span
                className={cx(
                  'mono shrink-0 text-xs tabular-nums',
                  overdue ? 'text-danger' : 'text-ink-2',
                )}
              >
                {formatDue(item.due, item.dueTime, today, o)}
              </span>
            )}
            {repeat && (
              <span className="mono flex shrink-0 items-center gap-1 text-xs text-ink-3">
                <RepeatGlyph className="size-3" aria-hidden />
                {repeat}
              </span>
            )}
            {listName && <span className="truncate-1 text-xs text-ink-3">{listName}</span>}
          </div>
        )}
      </div>
      <IconButton
        size="sm"
        tabIndex={-1}
        label={item.flagged ? `Remove flag from ${title}` : `Flag ${title}`}
        onClick={onToggleFlagged}
        className={cx('shrink-0', item.flagged ? 'text-accent' : 'text-ink-3')}
      >
        <Flag className={item.flagged ? 'fill-current' : undefined} />
      </IconButton>
      <IconButton
        size="sm"
        tabIndex={-1}
        label={`Edit ${title}`}
        onClick={onOpen}
        className="shrink-0 text-ink-3"
      >
        <SquarePen />
      </IconButton>
    </div>
  );
}

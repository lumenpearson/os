import { cx } from '@lumen/ui';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { displayTitle, type EventColor, type Occurrence } from './events';
import { type FormatOptions, formatTimeOfDay } from './format';

/**
 * The four event tones: the neutral ramp and the one accent. Each keeps a
 * border so a filled chip and an outlined one are the same height.
 */
export const TONE_CLASS: Record<EventColor, string> = {
  neutral: 'border-transparent bg-surface-2 text-ink',
  accent: 'border-transparent bg-accent text-accent-ink',
  ink: 'border-transparent bg-ink text-ink-inverse',
  outline: 'border-rule-strong bg-surface text-ink',
};

/** The same tones as a swatch for the colour picker. */
export const SWATCH_CLASS: Record<EventColor, string> = {
  neutral: 'border-rule-strong bg-surface-2',
  accent: 'border-transparent bg-accent',
  ink: 'border-transparent bg-ink',
  outline: 'border-rule-strong bg-surface',
};

export const SELECTED_RING = 'outline-2 outline-offset-1 outline-accent';

export interface EventChipProps {
  occurrence: Occurrence;
  selected: boolean;
  o: FormatOptions;
  /** Drop the time and keep one line (the month grid). */
  dense?: boolean;
  /** -1 inside the month grid, where the grid itself owns the tab stop. */
  tabIndex?: number;
  onSelect: () => void;
  onOpen: () => void;
  className?: string;
}

/** One event on a row: the month grid, the all-day band, the sidebar list. */
export function EventChip({
  occurrence,
  selected,
  o,
  dense,
  tabIndex,
  onSelect,
  onOpen,
  className,
}: EventChipProps) {
  const timed = !occurrence.allDay;
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      data-event-id={occurrence.id}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        }
      }}
      title={titleFor(occurrence, o)}
      className={cx(
        'flex h-[18px] w-full shrink-0 items-center gap-1 rounded-xs border px-1 text-left lumen-focus',
        'transition-[background-color,color] duration-(--duration-fast) ease-(--ease-standard)',
        TONE_CLASS[occurrence.event.color],
        selected && SELECTED_RING,
        className,
      )}
    >
      {timed && !dense && (
        <span className="mono shrink-0 text-2xs tabular-nums opacity-70">
          {formatTimeOfDay(occurrence.start, o)}
        </span>
      )}
      {timed && dense && (
        <span
          aria-hidden
          className={cx(
            'size-1 shrink-0 rounded-xs',
            occurrence.event.color === 'neutral' || occurrence.event.color === 'outline'
              ? 'bg-accent'
              : 'bg-current opacity-70',
          )}
        />
      )}
      <span className="truncate-1 text-xs">{displayTitle(occurrence.event)}</span>
    </button>
  );
}

/** The tooltip and accessible name: title, time, place. */
export function titleFor(occurrence: Occurrence, o: FormatOptions): string {
  const parts = [displayTitle(occurrence.event)];
  parts.push(
    occurrence.allDay
      ? 'All day'
      : `${formatTimeOfDay(occurrence.start, o)} – ${formatTimeOfDay(occurrence.end, o)}`,
  );
  if (occurrence.event.location) parts.push(occurrence.event.location);
  return parts.join(' · ');
}

export interface TimeBlockProps {
  occurrence: Occurrence;
  selected: boolean;
  o: FormatOptions;
  /** Fractions of the day column, from the overlap layout. */
  left: number;
  width: number;
  top: number;
  height: number;
  onSelect: () => void;
  onOpen: () => void;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

/** One event drawn in the hour grid, sized by its length and its column. */
export function TimeBlock({
  occurrence,
  selected,
  o,
  left,
  width,
  top,
  height,
  onSelect,
  onOpen,
  onPointerDown,
}: TimeBlockProps) {
  const short = height < 30;
  return (
    <button
      type="button"
      data-event-id={occurrence.id}
      data-cursor="grab"
      aria-current={selected ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        }
      }}
      title={titleFor(occurrence, o)}
      style={{
        top,
        height,
        left: `calc(${left * 100}% + 1px)`,
        width: `calc(${width * 100}% - 2px)`,
      }}
      className={cx(
        'absolute flex flex-col items-start overflow-hidden rounded-xs border px-1 py-px text-left lumen-focus',
        TONE_CLASS[occurrence.event.color],
        selected && SELECTED_RING,
      )}
    >
      <span className={cx('truncate-1 w-full text-xs font-medium', short && 'leading-4')}>
        {displayTitle(occurrence.event)}
      </span>
      {!short && (
        <span className="mono truncate-1 w-full text-2xs tabular-nums opacity-70">
          {formatTimeOfDay(occurrence.start, o)}
          {occurrence.event.location ? ` · ${occurrence.event.location}` : ''}
        </span>
      )}
    </button>
  );
}

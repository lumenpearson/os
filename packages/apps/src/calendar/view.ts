/**
 * What each view shows: the range of days it draws, what a step forward or
 * back means in it, what its title reads, and where an arrow key moves the
 * focused day in the month grid.
 */
import {
  addDays,
  addMonths,
  type DateKey,
  endOfMonth,
  endOfWeek,
  type FirstDay,
  monthGrid,
  startOfMonth,
  startOfWeek,
} from './dates';
import { type FormatOptions, formatDateRange, formatFullDate, formatMonthYear } from './format';

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export const VIEWS: readonly CalendarView[] = ['month', 'week', 'day', 'agenda'];

export const VIEW_LABELS: Record<CalendarView, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
};

export const VIEW_SHORTCUTS: Record<CalendarView, string> = {
  month: 'Mod+1',
  week: 'Mod+2',
  day: 'Mod+3',
  agenda: 'Mod+4',
};

/** How far ahead the agenda reads. */
export const AGENDA_DAYS = 90;

export interface DateRange {
  from: DateKey;
  to: DateKey;
}

/** The days a view has to have events for, including the month grid's edges. */
export function viewRange(view: CalendarView, cursor: DateKey, firstDay: FirstDay): DateRange {
  switch (view) {
    case 'month': {
      const grid = monthGrid(cursor, firstDay);
      return { from: grid[0] ?? cursor, to: grid[grid.length - 1] ?? cursor };
    }
    case 'week':
      return { from: startOfWeek(cursor, firstDay), to: endOfWeek(cursor, firstDay) };
    case 'day':
      return { from: cursor, to: cursor };
    case 'agenda':
      return { from: cursor, to: addDays(cursor, AGENDA_DAYS - 1) };
  }
}

/** One period forward (`+1`) or back (`-1`) in the current view. */
export function stepCursor(view: CalendarView, cursor: DateKey, direction: 1 | -1): DateKey {
  switch (view) {
    case 'month':
      return addMonths(cursor, direction);
    case 'week':
      return addDays(cursor, direction * 7);
    case 'day':
      return addDays(cursor, direction);
    case 'agenda':
      return addDays(cursor, direction * AGENDA_DAYS);
  }
}

export function viewTitle(
  view: CalendarView,
  cursor: DateKey,
  firstDay: FirstDay,
  o: FormatOptions,
): string {
  switch (view) {
    case 'month':
      return formatMonthYear(cursor, o);
    case 'week':
      return formatDateRange(startOfWeek(cursor, firstDay), endOfWeek(cursor, firstDay), o);
    case 'day':
      return formatFullDate(cursor, o);
    case 'agenda': {
      const range = viewRange('agenda', cursor, firstDay);
      return formatDateRange(range.from, range.to, o);
    }
  }
}

export type GridMove =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'week-start'
  | 'week-end'
  | 'month-start'
  | 'month-end'
  | 'page-back'
  | 'page-forward';

/** Where a key takes the focused day in the month grid. */
export function moveFocus(cursor: DateKey, move: GridMove, firstDay: FirstDay): DateKey {
  switch (move) {
    case 'left':
      return addDays(cursor, -1);
    case 'right':
      return addDays(cursor, 1);
    case 'up':
      return addDays(cursor, -7);
    case 'down':
      return addDays(cursor, 7);
    case 'week-start':
      return startOfWeek(cursor, firstDay);
    case 'week-end':
      return endOfWeek(cursor, firstDay);
    case 'month-start':
      return startOfMonth(cursor);
    case 'month-end':
      return endOfMonth(cursor);
    case 'page-back':
      return addMonths(cursor, -1);
    case 'page-forward':
      return addMonths(cursor, 1);
  }
}

/** The grid move a key press asks for, or null when the grid should ignore it. */
export function moveForKey(key: string, modifier: boolean): GridMove | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Home':
      return modifier ? 'month-start' : 'week-start';
    case 'End':
      return modifier ? 'month-end' : 'week-end';
    case 'PageUp':
      return 'page-back';
    case 'PageDown':
      return 'page-forward';
    default:
      return null;
  }
}

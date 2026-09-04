/**
 * Placing timed events in a day column.
 *
 * Events that overlap in time share the width of the column: they are grouped
 * into clusters of mutually overlapping events, each event takes the leftmost
 * column that is free at its start, and every event in a cluster is one
 * `1 / columns` slice wide. Two events that merely touch — one ends where the
 * next begins — do not overlap and both keep the full width.
 */
import { addDays, type DateKey, MINUTES_PER_DAY } from './dates';
import type { Occurrence } from './events';

export interface TimeSpan {
  id: string;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from the same midnight; always greater than `start`. */
  end: number;
}

export interface PlacedSpan extends TimeSpan {
  /** 0-based column inside its cluster. */
  column: number;
  /** Columns the cluster needed. */
  columns: number;
  /** Fraction of the day's width, 0–1. */
  left: number;
  width: number;
}

/** A slice of one occurrence that falls inside a single day. */
export interface DaySegment extends TimeSpan {
  date: DateKey;
  occurrence: Occurrence;
  /** False when the event started the day before and runs on. */
  first: boolean;
}

/** Shortest slice that still gets drawn, so a 5-minute event stays readable. */
export const MIN_SLOT_MINUTES = 15;

function compareSpans(a: TimeSpan, b: TimeSpan): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return b.end - a.end;
  return a.id.localeCompare(b.id);
}

/**
 * Assign every span a column and the cluster's column count. Input order does
 * not matter; the result is sorted by start.
 */
export function layoutOverlaps(spans: readonly TimeSpan[]): PlacedSpan[] {
  const sorted = [...spans].sort(compareSpans);
  const out: PlacedSpan[] = [];
  /** Spans of the cluster being built, with the column each one took. */
  let cluster: PlacedSpan[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    const columns = columnEnds.length;
    for (const span of cluster) {
      span.columns = columns;
      span.left = span.column / columns;
      span.width = 1 / columns;
    }
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const span of sorted) {
    const end = Math.max(span.end, span.start + MIN_SLOT_MINUTES);
    if (cluster.length > 0 && span.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= span.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    cluster.push({ ...span, column, columns: 1, left: 0, width: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return out;
}

/**
 * Split an occurrence into the day-sized pieces the hour grid draws. A timed
 * event that runs past midnight becomes two pieces; everything else, one.
 */
export function daySegments(occurrence: Occurrence): DaySegment[] {
  if (occurrence.allDay) return [];
  const start = Math.max(0, Math.min(MINUTES_PER_DAY, occurrence.start));
  const end = Math.max(start + 1, occurrence.end);
  if (end <= MINUTES_PER_DAY) {
    return [{ id: occurrence.id, date: occurrence.date, start, end, occurrence, first: true }];
  }
  return [
    {
      id: occurrence.id,
      date: occurrence.date,
      start,
      end: MINUTES_PER_DAY,
      occurrence,
      first: true,
    },
    {
      id: `${occurrence.id}+1`,
      date: addDays(occurrence.date, 1),
      start: 0,
      end: Math.min(MINUTES_PER_DAY, end - MINUTES_PER_DAY),
      occurrence,
      first: false,
    },
  ];
}

export interface PlacedSegment extends DaySegment {
  column: number;
  columns: number;
  left: number;
  width: number;
}

/** Every timed occurrence of one day, cut to that day and placed in columns. */
export function layoutDay(occurrences: readonly Occurrence[], date: DateKey): PlacedSegment[] {
  const segments = occurrences.flatMap(daySegments).filter((s) => s.date === date);
  const placed = new Map(layoutOverlaps(segments).map((p) => [p.id, p]));
  return segments
    .map((segment) => {
      const p = placed.get(segment.id);
      return {
        ...segment,
        column: p?.column ?? 0,
        columns: p?.columns ?? 1,
        left: p?.left ?? 0,
        width: p?.width ?? 1,
      };
    })
    .sort(compareSpans);
}

// ── grid geometry ─────────────────────────────────────────────────────────

/** Round to the nearest step, e.g. the 15-minute slots a drag snaps to. */
export function snapTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

/** Minutes at a vertical offset inside a day column of `height` pixels. */
export function minutesAt(offsetY: number, height: number, step = 0): number {
  if (height <= 0) return 0;
  const raw = (offsetY / height) * MINUTES_PER_DAY;
  const snapped = step > 0 ? snapTo(raw, step) : Math.round(raw);
  return Math.min(MINUTES_PER_DAY, Math.max(0, snapped));
}

/** The day column under a horizontal offset, clamped to the grid. */
export function columnAt(offsetX: number, width: number, count: number): number {
  if (count <= 0) return 0;
  if (width <= 0) return 0;
  const index = Math.floor((offsetX / width) * count);
  return Math.min(count - 1, Math.max(0, index));
}

export interface DragRange {
  start: number;
  end: number;
}

/** Two ends of a drag, ordered and never shorter than one slot. */
export function dragRange(anchor: number, cursor: number, step = MIN_SLOT_MINUTES): DragRange {
  const start = Math.min(anchor, cursor);
  const end = Math.max(anchor, cursor);
  if (end - start >= step) return { start, end };
  if (start + step <= MINUTES_PER_DAY) return { start, end: start + step };
  return { start: Math.max(0, MINUTES_PER_DAY - step), end: MINUTES_PER_DAY };
}

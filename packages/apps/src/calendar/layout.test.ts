import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from './dates';
import { createEvent, type EventInput, type Occurrence } from './events';
import {
  columnAt,
  daySegments,
  dragRange,
  layoutDay,
  layoutOverlaps,
  MIN_SLOT_MINUTES,
  minutesAt,
  snapTo,
  type TimeSpan,
} from './layout';

const span = (id: string, start: number, end: number): TimeSpan => ({ id, start, end });

function occurrence(id: string, input: EventInput): Occurrence {
  const event = createEvent(input, id, 0);
  return {
    id,
    event,
    origin: event.date,
    date: event.date,
    endDate: event.endDate,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    moved: false,
  };
}

function widths(spans: TimeSpan[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of layoutOverlaps(spans)) out[p.id] = `${p.column}/${p.columns}`;
  return out;
}

describe('layoutOverlaps', () => {
  it('gives a lone event the whole column', () => {
    const [only] = layoutOverlaps([span('a', 540, 600)]);
    expect(only).toMatchObject({ column: 0, columns: 1, left: 0, width: 1 });
  });

  it('splits two events that overlap', () => {
    expect(widths([span('a', 540, 660), span('b', 600, 720)])).toEqual({
      a: '0/2',
      b: '1/2',
    });
  });

  it('leaves events that only touch at full width', () => {
    expect(widths([span('a', 540, 600), span('b', 600, 660)])).toEqual({
      a: '0/1',
      b: '0/1',
    });
  });

  it('reuses a column once its event has finished', () => {
    // a runs all morning; b and c fill the second column one after the other.
    expect(widths([span('a', 540, 720), span('b', 555, 600), span('c', 615, 660)])).toEqual({
      a: '0/2',
      b: '1/2',
      c: '1/2',
    });
  });

  it('grows to three columns when three events share a minute', () => {
    expect(widths([span('a', 540, 660), span('b', 555, 675), span('c', 570, 690)])).toEqual({
      a: '0/3',
      b: '1/3',
      c: '2/3',
    });
  });

  it('keeps separate clusters independent', () => {
    const placed = layoutOverlaps([span('a', 540, 600), span('b', 545, 605), span('c', 700, 760)]);
    expect(placed.map((p) => `${p.id}:${p.columns}`)).toEqual(['a:2', 'b:2', 'c:1']);
    expect(placed[2]?.width).toBe(1);
  });

  it('does not depend on the order it is given', () => {
    const forward = widths([span('a', 540, 660), span('b', 600, 720), span('c', 630, 700)]);
    const backward = widths([span('c', 630, 700), span('b', 600, 720), span('a', 540, 660)]);
    expect(backward).toEqual(forward);
  });

  it('treats a very short event as one slot wide in time', () => {
    // Two five-minute events at the same minute still have to share.
    expect(widths([span('a', 540, 545), span('b', 542, 547)])).toEqual({
      a: '0/2',
      b: '1/2',
    });
  });

  it('places the earlier, then the longer, event first', () => {
    const placed = layoutOverlaps([span('b', 540, 600), span('a', 540, 700)]);
    expect(placed.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('daySegments', () => {
  it('leaves a normal event in one piece', () => {
    const segments = daySegments(occurrence('a', { date: '2026-09-04', start: 540, end: 600 }));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ date: '2026-09-04', start: 540, end: 600, first: true });
  });

  it('cuts an event that runs past midnight in two', () => {
    const segments = daySegments(
      occurrence('a', { date: '2026-09-04', start: 23 * 60, end: 25 * 60 }),
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ date: '2026-09-04', start: 1380, end: MINUTES_PER_DAY });
    expect(segments[1]).toMatchObject({ date: '2026-09-05', start: 0, end: 60, first: false });
  });

  it('has nothing to draw for an all-day event', () => {
    expect(daySegments(occurrence('a', { date: '2026-09-04', allDay: true }))).toEqual([]);
  });
});

describe('layoutDay', () => {
  it('places only the pieces that belong to the day', () => {
    const list = [
      occurrence('night', { date: '2026-09-04', start: 23 * 60, end: 25 * 60 }),
      occurrence('morning', { date: '2026-09-05', start: 30, end: 90 }),
      occurrence('elsewhere', { date: '2026-09-06', start: 540, end: 600 }),
    ];
    const placed = layoutDay(list, '2026-09-05');
    expect(placed.map((p) => p.id)).toEqual(['night+1', 'morning']);
    expect(placed[0]?.columns).toBe(2);
    expect(placed[1]?.left).toBe(0.5);
  });
});

describe('grid geometry', () => {
  it('snaps to a step', () => {
    expect(snapTo(97, 15)).toBe(90);
    expect(snapTo(98, 15)).toBe(105);
    expect(snapTo(90, 15)).toBe(90);
    expect(snapTo(7, 0)).toBe(7);
  });

  it('reads minutes off a pixel offset', () => {
    expect(minutesAt(0, 1440)).toBe(0);
    expect(minutesAt(720, 1440)).toBe(720);
    expect(minutesAt(-40, 1440)).toBe(0);
    expect(minutesAt(2000, 1440)).toBe(MINUTES_PER_DAY);
    expect(minutesAt(100, 1440, 15)).toBe(105);
    expect(minutesAt(10, 0)).toBe(0);
  });

  it('reads the column under a pointer', () => {
    expect(columnAt(0, 700, 7)).toBe(0);
    expect(columnAt(350, 700, 7)).toBe(3);
    expect(columnAt(699, 700, 7)).toBe(6);
    expect(columnAt(9999, 700, 7)).toBe(6);
    expect(columnAt(-20, 700, 7)).toBe(0);
  });

  it('orders the two ends of a drag and keeps a minimum length', () => {
    expect(dragRange(600, 540)).toEqual({ start: 540, end: 600 });
    expect(dragRange(540, 540)).toEqual({ start: 540, end: 540 + MIN_SLOT_MINUTES });
    expect(dragRange(MINUTES_PER_DAY, MINUTES_PER_DAY)).toEqual({
      start: MINUTES_PER_DAY - MIN_SLOT_MINUTES,
      end: MINUTES_PER_DAY,
    });
  });
});

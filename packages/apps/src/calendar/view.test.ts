import { describe, expect, it } from 'vitest';
import type { FormatOptions } from './format';
import {
  AGENDA_DAYS,
  layoutFor,
  moveFocus,
  moveForKey,
  stepCursor,
  VIEW_LABELS,
  VIEWS,
  viewRange,
  viewTitle,
} from './view';

const us: FormatOptions = { locale: 'en-US', hour12: true };

describe('viewRange', () => {
  it('covers the six rows a month grid draws', () => {
    expect(viewRange('month', '2026-09-15', 1)).toEqual({
      from: '2026-08-31',
      to: '2026-10-11',
    });
  });

  it('covers the week the region starts on', () => {
    expect(viewRange('week', '2026-09-04', 1)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(viewRange('week', '2026-09-04', 0)).toEqual({ from: '2026-08-30', to: '2026-09-05' });
  });

  it('covers one day, and the run of days the agenda reads', () => {
    expect(viewRange('day', '2026-09-04', 1)).toEqual({ from: '2026-09-04', to: '2026-09-04' });
    expect(viewRange('agenda', '2026-09-04', 1).to).toBe('2026-12-02');
  });
});

describe('stepCursor', () => {
  it('moves by the period on screen', () => {
    expect(stepCursor('month', '2026-09-15', 1)).toBe('2026-10-15');
    expect(stepCursor('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(stepCursor('week', '2026-09-04', -1)).toBe('2026-08-28');
    expect(stepCursor('day', '2026-09-04', 1)).toBe('2026-09-05');
    expect(stepCursor('agenda', '2026-09-04', 1)).toBe('2026-12-03');
  });

  it('comes back where it started', () => {
    for (const view of VIEWS) {
      expect(stepCursor(view, stepCursor(view, '2026-09-15', 1), -1)).toBe('2026-09-15');
    }
    expect(AGENDA_DAYS).toBeGreaterThan(0);
  });
});

describe('viewTitle', () => {
  it('names what is on screen', () => {
    expect(viewTitle('month', '2026-09-04', 1, us)).toBe('September 2026');
    expect(viewTitle('day', '2026-09-04', 1, us)).toBe('Friday, September 4, 2026');
    expect(viewTitle('week', '2026-09-04', 1, us)).toContain('31');
    expect(viewTitle('agenda', '2026-09-04', 1, us)).toContain('Dec');
  });

  it('has a label for every view', () => {
    expect(VIEWS.map((v) => VIEW_LABELS[v])).toEqual(['Month', 'Week', 'Day', 'Agenda']);
  });
});

describe('moveFocus', () => {
  it('walks the grid a day and a row at a time', () => {
    expect(moveFocus('2026-09-04', 'left', 1)).toBe('2026-09-03');
    expect(moveFocus('2026-09-04', 'right', 1)).toBe('2026-09-05');
    expect(moveFocus('2026-09-04', 'up', 1)).toBe('2026-08-28');
    expect(moveFocus('2026-09-04', 'down', 1)).toBe('2026-09-11');
  });

  it('jumps to the ends of the week, the month and the next page', () => {
    expect(moveFocus('2026-09-04', 'week-start', 1)).toBe('2026-08-31');
    expect(moveFocus('2026-09-04', 'week-start', 0)).toBe('2026-08-30');
    expect(moveFocus('2026-09-04', 'week-end', 1)).toBe('2026-09-06');
    expect(moveFocus('2026-09-04', 'month-start', 1)).toBe('2026-09-01');
    expect(moveFocus('2026-09-04', 'month-end', 1)).toBe('2026-09-30');
    expect(moveFocus('2026-09-04', 'page-back', 1)).toBe('2026-08-04');
    expect(moveFocus('2026-09-04', 'page-forward', 1)).toBe('2026-10-04');
  });

  it('leaves the keys it has no answer for alone', () => {
    expect(moveForKey('ArrowLeft', false)).toBe('left');
    expect(moveForKey('Home', false)).toBe('week-start');
    expect(moveForKey('Home', true)).toBe('month-start');
    expect(moveForKey('End', true)).toBe('month-end');
    expect(moveForKey('PageDown', false)).toBe('page-forward');
    expect(moveForKey('a', false)).toBeNull();
    expect(moveForKey('Enter', false)).toBeNull();
  });
});

describe('layoutFor', () => {
  it('gives everything room in a wide window', () => {
    expect(layoutFor(940, { showSidebar: true })).toEqual({
      sidebar: true,
      weekNumbers: true,
      compactViews: false,
      narrowDays: false,
    });
  });

  it('drops the sidebar, then the week numbers, then the words', () => {
    expect(layoutFor(700, { showSidebar: true }).sidebar).toBe(false);
    expect(layoutFor(600, { showSidebar: true })).toMatchObject({
      weekNumbers: true,
      compactViews: true,
    });
    expect(layoutFor(500, { showSidebar: true }).weekNumbers).toBe(false);
    expect(layoutFor(380, { showSidebar: true }).narrowDays).toBe(true);
  });

  it('keeps the sidebar hidden when the user closed it', () => {
    expect(layoutFor(1200, { showSidebar: false }).sidebar).toBe(false);
  });
});

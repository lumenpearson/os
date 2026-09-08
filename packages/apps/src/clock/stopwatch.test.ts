import { describe, expect, it } from 'vitest';
import {
  completedLaps,
  currentLap,
  elapsed,
  IDLE_STOPWATCH,
  isIdle,
  isRunning,
  lap,
  lapExtremes,
  reset,
  type StopwatchState,
  start,
  stop,
  toggle,
} from './stopwatch';

/** Drive the watch through a script of [action, timestamp] pairs. */
function run(steps: Array<['start' | 'stop' | 'lap', number]>): StopwatchState {
  let state = IDLE_STOPWATCH;
  for (const [action, at] of steps) {
    if (action === 'start') state = start(state, at);
    else if (action === 'stop') state = stop(state, at);
    else state = lap(state, at);
  }
  return state;
}

describe('reading the watch', () => {
  it('is zero before it is started', () => {
    expect(elapsed(IDLE_STOPWATCH, 5_000)).toBe(0);
    expect(isRunning(IDLE_STOPWATCH)).toBe(false);
    expect(isIdle(IDLE_STOPWATCH)).toBe(true);
  });

  it('is the difference from the instant it started', () => {
    const state = start(IDLE_STOPWATCH, 1_000);
    expect(elapsed(state, 1_000)).toBe(0);
    expect(elapsed(state, 1_250)).toBe(250);
    expect(elapsed(state, 61_000)).toBe(60_000);
  });

  it('holds still while stopped', () => {
    const state = run([
      ['start', 0],
      ['stop', 1_500],
    ]);
    expect(elapsed(state, 1_500)).toBe(1_500);
    expect(elapsed(state, 900_000)).toBe(1_500);
  });

  it('ignores a second start and a stop while stopped', () => {
    const running = start(IDLE_STOPWATCH, 100);
    expect(start(running, 5_000)).toBe(running);
    expect(stop(IDLE_STOPWATCH, 5_000)).toBe(IDLE_STOPWATCH);
  });

  it('alternates on toggle', () => {
    const on = toggle(IDLE_STOPWATCH, 0);
    expect(isRunning(on)).toBe(true);
    const off = toggle(on, 400);
    expect(isRunning(off)).toBe(false);
    expect(elapsed(off, 10_000)).toBe(400);
  });
});

describe('a pause does not drift', () => {
  it('banks the run and resumes from the new instant, however long the gap', () => {
    const state = run([
      ['start', 0],
      ['stop', 1_000],
      ['start', 10_000_000],
    ]);
    expect(elapsed(state, 10_000_500)).toBe(1_500);
  });

  it('adds up the runs and not the gaps, over many cycles', () => {
    let state = IDLE_STOPWATCH;
    let clock = 0;
    for (let cycle = 0; cycle < 500; cycle += 1) {
      state = start(state, clock);
      clock += 137; // a run
      state = stop(state, clock);
      clock += 9_871; // a pause of no interest to the reading
    }
    expect(elapsed(state, clock)).toBe(500 * 137);
  });

  it('never goes backwards if the caller hands it a stale timestamp', () => {
    const state = start(IDLE_STOPWATCH, 1_000);
    expect(elapsed(state, 900)).toBe(0);
  });
});

describe('laps', () => {
  it('records the reading at each lap and derives the deltas from it', () => {
    const state = run([
      ['start', 0],
      ['lap', 1_000],
      ['lap', 3_500],
      ['lap', 4_000],
    ]);
    expect(completedLaps(state)).toEqual([
      { number: 3, at: 4_000, delta: 500 },
      { number: 2, at: 3_500, delta: 2_500 },
      { number: 1, at: 1_000, delta: 1_000 },
    ]);
  });

  it('counts the lap in progress from the last mark', () => {
    const state = run([
      ['start', 0],
      ['lap', 1_000],
    ]);
    expect(currentLap(state, 1_750)).toEqual({ number: 2, at: 1_750, delta: 750 });
  });

  it('measures the first lap from the start', () => {
    expect(currentLap(start(IDLE_STOPWATCH, 500), 800)).toEqual({
      number: 1,
      at: 300,
      delta: 300,
    });
  });

  it('excludes paused time, so a lap taken after a break is still its own time', () => {
    const state = run([
      ['start', 0],
      ['lap', 1_000],
      ['stop', 2_000],
      ['start', 60_000],
      ['lap', 60_500],
    ]);
    expect(completedLaps(state)[0]).toEqual({ number: 2, at: 2_500, delta: 1_500 });
  });

  it('cannot be taken while the watch is stopped', () => {
    const stopped = run([
      ['start', 0],
      ['stop', 1_000],
    ]);
    expect(lap(stopped, 2_000)).toBe(stopped);
    expect(lap(IDLE_STOPWATCH, 10)).toBe(IDLE_STOPWATCH);
  });

  it('clears everything on reset', () => {
    const state = run([
      ['start', 0],
      ['lap', 1_000],
    ]);
    expect(reset(state)).toEqual(IDLE_STOPWATCH);
  });
});

describe('marking the fastest and slowest lap', () => {
  const laps = (marks: number[]) => {
    let state = start(IDLE_STOPWATCH, 0);
    for (const at of marks) state = lap(state, at);
    return completedLaps(state);
  };

  it('says nothing until there are three laps', () => {
    expect(lapExtremes(laps([1_000]))).toEqual({ fastest: null, slowest: null });
    expect(lapExtremes(laps([1_000, 3_000]))).toEqual({ fastest: null, slowest: null });
  });

  it('names both once there are three', () => {
    expect(lapExtremes(laps([1_000, 3_000, 3_500]))).toEqual({ fastest: 3, slowest: 2 });
  });

  it('compares lap times, not the running total', () => {
    // The totals only rise; lap 3 is the quickest and the last one the slowest.
    expect(lapExtremes(laps([5_000, 9_000, 9_100, 15_000]))).toEqual({ fastest: 3, slowest: 4 });
  });

  it('marks nothing when every lap is the same length', () => {
    expect(lapExtremes(laps([1_000, 2_000, 3_000, 4_000]))).toEqual({
      fastest: null,
      slowest: null,
    });
  });
});

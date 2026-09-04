/**
 * The stopwatch as a pure state machine over timestamps.
 *
 * Nothing here counts. The state stores the instant the current run began and
 * the milliseconds banked by earlier runs; the reading is `elapsed(state, now)`
 * — a subtraction. That is the whole point: a tab switch, a hidden window or a
 * pause of any length changes when the next reading happens, never what it
 * says. `now` comes from the caller (`performance.now()` in the app, plain
 * numbers in tests) and only ever has to be monotonic.
 */

export interface StopwatchState {
  /** Instant the current run started; null while stopped. */
  since: number | null;
  /** Milliseconds from all earlier runs. */
  banked: number;
  /** The reading at each lap taken, in the order they were taken. */
  marks: readonly number[];
}

export const IDLE_STOPWATCH: StopwatchState = { since: null, banked: 0, marks: [] };

/** Laps are only compared once there are enough of them for a comparison to mean something. */
export const COMPARE_AFTER = 3;

export interface Lap {
  /** 1-based, the number shown in the list. */
  number: number;
  /** The stopwatch reading when the lap was taken. */
  at: number;
  /** The lap's own time. */
  delta: number;
}

export function isRunning(state: StopwatchState): boolean {
  return state.since !== null;
}

/** Whether anything has been timed yet — the difference between Reset and a fresh watch. */
export function isIdle(state: StopwatchState): boolean {
  return state.since === null && state.banked === 0 && state.marks.length === 0;
}

export function elapsed(state: StopwatchState, now: number): number {
  if (state.since === null) return state.banked;
  return state.banked + Math.max(0, now - state.since);
}

export function start(state: StopwatchState, now: number): StopwatchState {
  if (state.since !== null) return state;
  return { ...state, since: now };
}

export function stop(state: StopwatchState, now: number): StopwatchState {
  if (state.since === null) return state;
  return { ...state, since: null, banked: elapsed(state, now) };
}

export function toggle(state: StopwatchState, now: number): StopwatchState {
  return state.since === null ? start(state, now) : stop(state, now);
}

/** Close the running lap and open the next. A stopped watch has no lap to close. */
export function lap(state: StopwatchState, now: number): StopwatchState {
  if (state.since === null) return state;
  return { ...state, marks: [...state.marks, elapsed(state, now)] };
}

export function reset(_state: StopwatchState): StopwatchState {
  return IDLE_STOPWATCH;
}

/** The finished laps, newest first — the order the list shows them in. */
export function completedLaps(state: StopwatchState): Lap[] {
  const out: Lap[] = [];
  let previous = 0;
  for (const [index, at] of state.marks.entries()) {
    out.push({ number: index + 1, at, delta: at - previous });
    previous = at;
  }
  return out.reverse();
}

/** The lap in progress: its number and the time it has run for. */
export function currentLap(state: StopwatchState, now: number): Lap {
  const marks = state.marks;
  const previous = marks.length > 0 ? (marks[marks.length - 1] as number) : 0;
  const at = elapsed(state, now);
  return { number: marks.length + 1, at, delta: at - previous };
}

export interface LapExtremes {
  /** Lap numbers, or null while there is nothing to compare. */
  fastest: number | null;
  slowest: number | null;
}

/**
 * The quickest and slowest finished laps. Below three laps a comparison is
 * just "the other one", so it is not made; if every lap is the same length
 * there is no extreme to point at either.
 */
export function lapExtremes(laps: readonly Lap[], after = COMPARE_AFTER): LapExtremes {
  if (laps.length < after) return { fastest: null, slowest: null };
  let fastest = laps[0] as Lap;
  let slowest = laps[0] as Lap;
  for (const item of laps) {
    if (item.delta < fastest.delta) fastest = item;
    if (item.delta > slowest.delta) slowest = item;
  }
  if (fastest.delta === slowest.delta) return { fastest: null, slowest: null };
  return { fastest: fastest.number, slowest: slowest.number };
}

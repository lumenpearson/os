import { describe, expect, it } from 'vitest';
import { MAX_DURATION, MINUTE, SECOND } from './duration';
import {
  armed,
  isIdle,
  isRunning,
  pause,
  progress,
  remaining,
  reset,
  setDuration,
  settle,
  start,
  toggle,
} from './timer';

const FIVE = 5 * MINUTE;

describe('setting a timer', () => {
  it('is armed with the full duration and not running', () => {
    const state = armed(FIVE);
    expect(state).toEqual({ duration: FIVE, deadline: null, rest: FIVE, finished: false });
    expect(isRunning(state)).toBe(false);
    expect(isIdle(state)).toBe(true);
    expect(remaining(state, 999_999)).toBe(FIVE);
  });

  it('clamps what it is given', () => {
    expect(armed(-1).duration).toBe(0);
    expect(armed(MAX_DURATION * 2).duration).toBe(MAX_DURATION);
  });

  it('re-arms when the duration changes mid-count', () => {
    const running = start(armed(FIVE), 0);
    const changed = setDuration(running, MINUTE);
    expect(changed).toEqual(armed(MINUTE));
    expect(isRunning(changed)).toBe(false);
  });

  it('will not start with nothing on the clock', () => {
    const zero = armed(0);
    expect(start(zero, 0)).toBe(zero);
  });
});

describe('counting down', () => {
  it('reads the difference to the deadline', () => {
    const state = start(armed(FIVE), 1_000);
    expect(state.deadline).toBe(1_000 + FIVE);
    expect(remaining(state, 1_000)).toBe(FIVE);
    expect(remaining(state, 1_000 + 90 * SECOND)).toBe(FIVE - 90 * SECOND);
  });

  it('never reads below zero, however late the reading is', () => {
    const state = start(armed(FIVE), 0);
    expect(remaining(state, FIVE + 60 * MINUTE)).toBe(0);
  });

  it('reports how much has drained', () => {
    const state = start(armed(FIVE), 0);
    expect(progress(state, 0)).toBe(0);
    expect(progress(state, FIVE / 2)).toBeCloseTo(0.5, 10);
    expect(progress(state, FIVE)).toBe(1);
  });

  it('ignores a second start', () => {
    const state = start(armed(FIVE), 0);
    expect(start(state, 10_000)).toBe(state);
  });
});

describe('a pause does not drift', () => {
  it('keeps what was left and counts on from the instant of the resume', () => {
    const started = start(armed(FIVE), 0);
    const paused = pause(started, 60 * SECOND);
    expect(remaining(paused, 60 * SECOND)).toBe(4 * MINUTE);
    expect(remaining(paused, 10_000_000)).toBe(4 * MINUTE);

    const resumed = start(paused, 10_000_000);
    expect(remaining(resumed, 10_000_000)).toBe(4 * MINUTE);
    expect(remaining(resumed, 10_000_000 + 60 * SECOND)).toBe(3 * MINUTE);
  });

  it('survives many pauses without losing or gaining a millisecond', () => {
    let state = armed(FIVE);
    let clock = 0;
    for (let cycle = 0; cycle < 100; cycle += 1) {
      state = start(state, clock);
      clock += SECOND;
      state = pause(state, clock);
      clock += 60 * MINUTE; // the window was hidden; the timer was not
    }
    expect(remaining(state, clock)).toBe(FIVE - 100 * SECOND);
  });

  it('alternates on toggle', () => {
    const on = toggle(armed(FIVE), 0);
    expect(isRunning(on)).toBe(true);
    const off = toggle(on, SECOND);
    expect(isRunning(off)).toBe(false);
    expect(remaining(off, 500_000)).toBe(FIVE - SECOND);
  });

  it('goes back to the full duration on reset', () => {
    const state = pause(start(armed(FIVE), 0), 30 * SECOND);
    expect(reset(state)).toEqual(armed(FIVE));
  });
});

describe('reaching zero', () => {
  it('changes nothing, and says nothing, before the deadline', () => {
    const state = start(armed(FIVE), 0);
    const outcome = settle(state, FIVE - 1);
    expect(outcome.completed).toBe(false);
    expect(outcome.state).toBe(state);
  });

  it('completes on the reading that passes the deadline', () => {
    const state = start(armed(FIVE), 0);
    const outcome = settle(state, FIVE);
    expect(outcome.completed).toBe(true);
    expect(outcome.state.finished).toBe(true);
    expect(isRunning(outcome.state)).toBe(false);
    expect(remaining(outcome.state, FIVE)).toBe(0);
  });

  it('completes once, not once per reading, however long the app was away', () => {
    const state = start(armed(FIVE), 0);
    const first = settle(state, FIVE + 45 * MINUTE);
    expect(first.completed).toBe(true);
    const second = settle(first.state, FIVE + 46 * MINUTE);
    expect(second.completed).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('runs the whole duration again when started after finishing', () => {
    const done = settle(start(armed(FIVE), 0), FIVE).state;
    const again = start(done, 100_000);
    expect(again.finished).toBe(false);
    expect(remaining(again, 100_000)).toBe(FIVE);
  });

  it('is no longer idle once it has finished', () => {
    const done = settle(start(armed(FIVE), 0), FIVE).state;
    expect(isIdle(done)).toBe(false);
    expect(isIdle(reset(done))).toBe(true);
  });
});

/**
 * The countdown, under the same discipline as the stopwatch: a running timer
 * stores the instant it reaches zero, a paused one stores what is left, and
 * `remaining(state, now)` is a subtraction. Nothing decrements. A timer that
 * spent ten minutes in a hidden window is exactly ten minutes further along
 * when it is looked at again, and one that has passed its deadline while
 * unobserved reports that on the next reading rather than losing the event.
 */

import { clampDuration } from './duration';

export interface TimerState {
  /** What the timer was set to. */
  duration: number;
  /** The instant it reaches zero; null while it is not running. */
  deadline: number | null;
  /** What is left while paused, or before the first start. */
  rest: number;
  /** True from reaching zero until it is reset or set again. */
  finished: boolean;
}

/** A timer set to `duration` and not yet started. */
export function armed(duration: number): TimerState {
  const value = clampDuration(duration);
  return { duration: value, deadline: null, rest: value, finished: false };
}

export const IDLE_TIMER: TimerState = armed(0);

export function isRunning(state: TimerState): boolean {
  return state.deadline !== null;
}

/** Nothing set, nothing counted: the state in which the fields are editable. */
export function isIdle(state: TimerState): boolean {
  return state.deadline === null && !state.finished && state.rest === state.duration;
}

export function remaining(state: TimerState, now: number): number {
  if (state.deadline === null) return Math.max(0, state.rest);
  return Math.max(0, state.deadline - now);
}

/** How much of the countdown is gone, 0 → 1. An unset timer is not under way. */
export function progress(state: TimerState, now: number): number {
  if (state.duration <= 0) return state.finished ? 1 : 0;
  return 1 - remaining(state, now) / state.duration;
}

/** Change what the timer is set to. A running timer is re-armed, not adjusted mid-flight. */
export function setDuration(state: TimerState, duration: number): TimerState {
  const value = clampDuration(duration);
  if (state.deadline === null && !state.finished && state.rest === state.duration) {
    return { duration: value, deadline: null, rest: value, finished: false };
  }
  return armed(value);
}

/** Start, or resume from where a pause left it. Starting a finished timer runs it again. */
export function start(state: TimerState, now: number): TimerState {
  if (state.deadline !== null) return state;
  const left = state.finished || state.rest <= 0 ? state.duration : state.rest;
  if (left <= 0) return state;
  return { ...state, deadline: now + left, rest: left, finished: false };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.deadline === null) return state;
  return { ...state, deadline: null, rest: remaining(state, now) };
}

export function toggle(state: TimerState, now: number): TimerState {
  return state.deadline === null ? start(state, now) : pause(state, now);
}

/** Back to the full duration, stopped. */
export function reset(state: TimerState): TimerState {
  return armed(state.duration);
}

export interface Settled {
  state: TimerState;
  /** True on the single reading that carries the timer past zero. */
  completed: boolean;
}

/**
 * Fold the clock forward. Called on every frame and whenever the app wakes up;
 * it reports completion exactly once, however late the reading is, and returns
 * the state unchanged (same object) when there is nothing to do.
 */
export function settle(state: TimerState, now: number): Settled {
  if (state.deadline === null || now < state.deadline) return { state, completed: false };
  return { state: { ...state, deadline: null, rest: 0, finished: true }, completed: true };
}

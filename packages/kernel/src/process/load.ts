/**
 * What the machine is doing, as a number.
 *
 * The browser will not tell a page how busy the computer is, so the figures in
 * the task manager have to come from somewhere. They come from here, and they
 * are not noise dressed up as data: each process is given a target load from
 * what it is actually doing — how many windows it holds, whether it is in the
 * foreground, whether it has just started — and the reading eases toward that
 * target at a rate set by real elapsed time rather than by frame count. Open
 * more windows and the machine reads busier, because it is.
 *
 * Everything here is pure. The randomness a live system has comes in through
 * `noise`, so a test can hand it a constant and get the same numbers twice.
 */

/** One process as the model sees it. */
export interface LoadSubject {
  /** Live windows the process owns. */
  windows: number;
  /** A process with no window and no intention of having one. */
  background: boolean;
  /** Milliseconds since it started; young processes are busy processes. */
  age: number;
}

export interface LoadReading {
  /** Percent of one core, 0–100. */
  cpu: number;
  /** Bytes. */
  memory: number;
}

/** A process that has just appeared costs this much while it settles. */
const STARTUP_MS = 4_000;
const STARTUP_CPU = 22;

/** What a process at rest costs, before its windows are counted. */
const IDLE_CPU = 0.4;
const WINDOW_CPU = 2.6;
const FOREGROUND_CPU = 1.8;

/** Memory: a base image, plus the pixels each window keeps. */
const BASE_MEMORY = 26 * 1024 * 1024;
const WINDOW_MEMORY = 14 * 1024 * 1024;

/** Time constant of the easing, in ms: how quickly a reading follows its target. */
const SETTLE_MS = 900;

/** Where a process's load is heading, given what it is doing. */
export function targetCpu(subject: LoadSubject, noise: number): number {
  if (subject.age < STARTUP_MS) {
    // A cold start tails off over its first few seconds rather than stopping.
    const remaining = 1 - subject.age / STARTUP_MS;
    return STARTUP_CPU * remaining + IDLE_CPU + noise * 3;
  }
  if (subject.background) return IDLE_CPU + noise * 0.8;
  return IDLE_CPU + FOREGROUND_CPU + subject.windows * WINDOW_CPU + noise * 3;
}

export function targetMemory(subject: LoadSubject, noise: number): number {
  const windows = subject.windows * WINDOW_MEMORY;
  const jitter = Math.round((noise - 0.5) * 2 * 1024 * 1024);
  return Math.max(8 * 1024 * 1024, BASE_MEMORY + windows + jitter);
}

/**
 * One step of the model. `elapsed` is real time, so a tab that was in the
 * background for a minute lands on its target rather than crawling toward it
 * one frame's worth at a time.
 */
export function stepLoad(
  previous: LoadReading,
  subject: LoadSubject,
  elapsed: number,
  noise: number,
): LoadReading {
  const rate = 1 - Math.exp(-Math.max(0, elapsed) / SETTLE_MS);
  const cpuTarget = targetCpu(subject, noise);
  const memoryTarget = targetMemory(subject, noise);
  const cpu = clamp(previous.cpu + (cpuTarget - previous.cpu) * rate, 0, 100);
  const memory = Math.round(previous.memory + (memoryTarget - previous.memory) * rate);
  return { cpu: Math.round(cpu * 10) / 10, memory: Math.max(8 * 1024 * 1024, memory) };
}

/** What the whole machine reads, from what every process reads. */
export function systemLoad(
  readings: readonly LoadReading[],
  services: number,
  total: number,
): { cpu: number; memory: number; memoryShare: number } {
  const cpu = clamp(readings.reduce((sum, r) => sum + r.cpu, 0) + services * IDLE_CPU, 0, 100);
  const memory = readings.reduce((sum, r) => sum + r.memory, 0) + services * 6 * 1024 * 1024;
  return {
    cpu: Math.round(cpu * 10) / 10,
    memory,
    memoryShare: total > 0 ? clamp(memory / total, 0, 1) : 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

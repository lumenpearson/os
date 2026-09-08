import type { LogLevel } from '@lumen/kernel';

export type { LogLevel };

/** Quietest first. The order the level filter and the export header use. */
export const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** One captured event. Ids are assigned by the capture, oldest lowest. */
export interface LogRecord {
  id: number;
  /** Epoch milliseconds. */
  timestamp: number;
  level: LogLevel;
  /** Where it came from: "kernel", "window", "console", "runtime", an app id… */
  source: string;
  message: string;
  /** Structured payload, shown as a tree when the row is expanded. */
  data?: unknown;
}

/** A record before the capture stamps it with an id and, usually, a time. */
export interface LogDraft {
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
  /** Only set when the event carries its own time (kernel log entries). */
  timestamp?: number;
}

/** Sources this app names itself, rather than passing through from the kernel. */
export const SOURCE = {
  window: 'window',
  notification: 'notification',
  apps: 'apps',
  settings: 'settings',
  session: 'session',
  theme: 'theme',
  console: 'console',
  runtime: 'runtime',
} as const;

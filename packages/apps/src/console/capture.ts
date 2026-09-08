/**
 * Turning what the running system emits into records. Everything here is a
 * pure mapping except `patchConsole`, which wraps a console object and hands
 * back the function that puts it exactly as it was.
 */
import type { LogEntry, Notification, SessionState } from '@lumen/kernel';
import { describeThrown, formatConsoleArgs } from './format';
import { type LogDraft, SOURCE } from './types';

/** A kernel log entry keeps its own source, level and time. */
export function kernelEntryDraft(entry: LogEntry): LogDraft {
  return {
    level: entry.level,
    source: entry.source,
    message: entry.message,
    data: entry.data,
    timestamp: entry.timestamp,
  };
}

export interface WindowEventPayload {
  windowId: string;
  pid: number;
}

/** A window opening or closing. The app id comes from the process table. */
export function windowDraft(
  kind: 'open' | 'close',
  payload: WindowEventPayload,
  appId?: string,
): LogDraft {
  const who = appId ?? `pid=${payload.pid}`;
  const data: Record<string, unknown> = { windowId: payload.windowId, pid: payload.pid };
  if (appId !== undefined) data.appId = appId;
  return {
    level: 'info',
    source: SOURCE.window,
    message: `window ${kind} ${who} id=${payload.windowId}`,
    data,
  };
}

/** A notification as it was posted, without the action callback. */
export function notificationDraft(notification: Notification): LogDraft {
  const data: Record<string, unknown> = {
    id: notification.id,
    appId: notification.appId,
    title: notification.title,
  };
  if (notification.body !== undefined) data.body = notification.body;
  if (notification.actions && notification.actions.length > 0) {
    data.actions = notification.actions.map((action) => action.label);
  }
  return {
    level: 'info',
    source: SOURCE.notification,
    message: `${notification.appId}: ${notification.title}`,
    data,
  };
}

/**
 * The kernel emits one event for install, uninstall and rescan alike, so the
 * record says what the event says and no more.
 */
export function appsChangedDraft(): LogDraft {
  return { level: 'info', source: SOURCE.apps, message: 'app registry changed' };
}

export function settingsDraft(payload: { path: string }): LogDraft {
  return { level: 'debug', source: SOURCE.settings, message: `settings ${payload.path}` };
}

export function sessionDraft(payload: { from: SessionState; to: SessionState }): LogDraft {
  return {
    level: 'info',
    source: SOURCE.session,
    message: `session ${payload.from} -> ${payload.to}`,
  };
}

export function themeDraft(payload: { theme: 'light' | 'dark' }): LogDraft {
  return { level: 'debug', source: SOURCE.theme, message: `theme ${payload.theme}` };
}

export interface UncaughtError {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}

/** An uncaught error: what was thrown, and where the browser saw it. */
export function errorEventDraft(event: UncaughtError): LogDraft {
  const thrown =
    event.error === undefined || event.error === null
      ? { message: event.message ?? '', data: undefined }
      : describeThrown(event.error);
  const at = event.filename
    ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
    : undefined;
  let data: unknown = thrown.data;
  if (at !== undefined) data = thrown.data === undefined ? { at } : { at, error: thrown.data };
  return {
    level: 'error',
    source: SOURCE.runtime,
    message: thrown.message || 'uncaught error',
    data,
  };
}

/** A promise that rejected with nobody to catch it. */
export function rejectionDraft(reason: unknown): LogDraft {
  const thrown = describeThrown(reason);
  return {
    level: 'error',
    source: SOURCE.runtime,
    message: `unhandled rejection: ${thrown.message}`,
    data: thrown.data,
  };
}

export type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error';

export const CONSOLE_METHODS: readonly ConsoleMethod[] = ['debug', 'log', 'info', 'warn', 'error'];

/** `console.log` is the level `info`; the rest name their own. */
export const CONSOLE_LEVEL = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const;

export type ConsoleTarget = { [K in ConsoleMethod]: (...args: unknown[]) => void };

/** What a console call printed, as a record. */
export function consoleDraft(method: ConsoleMethod, args: readonly unknown[]): LogDraft {
  const { message, data } = formatConsoleArgs(args);
  return {
    level: CONSOLE_LEVEL[method],
    source: SOURCE.console,
    message: message === '' ? `console.${method}()` : message,
    data,
  };
}

/**
 * True while a record is being made. Recording must never re-enter the
 * console — a warning raised while handling a warning would not stop.
 */
let recording = false;

/** Wrappers this module installed, so a restore only undoes its own work. */
const installed = new WeakSet<(...args: unknown[]) => void>();

/**
 * Wrap the console so every call is recorded as well as printed. The original
 * runs first and its result is never swallowed; the returned function puts
 * each method back, and only if nothing else replaced it in the meantime.
 * A console this module already wrapped is left alone.
 */
export function patchConsole(target: ConsoleTarget, emit: (draft: LogDraft) => void): () => void {
  if (CONSOLE_METHODS.some((method) => installed.has(target[method]))) return () => {};

  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  const wrappers = new Map<ConsoleMethod, (...args: unknown[]) => void>();

  for (const method of CONSOLE_METHODS) {
    const original = target[method];
    originals.set(method, original);
    const wrapper = (...args: unknown[]) => {
      try {
        original.apply(target, args);
      } finally {
        if (!recording) {
          recording = true;
          try {
            emit(consoleDraft(method, args));
          } catch {
            // A record that cannot be made must not break the call that printed.
          } finally {
            recording = false;
          }
        }
      }
    };
    installed.add(wrapper);
    wrappers.set(method, wrapper);
    target[method] = wrapper;
  }

  return () => {
    for (const method of CONSOLE_METHODS) {
      const wrapper = wrappers.get(method);
      const original = originals.get(method);
      if (!wrapper || !original) continue;
      installed.delete(wrapper);
      if (target[method] === wrapper) target[method] = original;
    }
  };
}

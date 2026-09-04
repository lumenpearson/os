import type { LogEntry, Notification } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import {
  appsChangedDraft,
  type ConsoleTarget,
  consoleDraft,
  errorEventDraft,
  kernelEntryDraft,
  notificationDraft,
  patchConsole,
  rejectionDraft,
  sessionDraft,
  settingsDraft,
  themeDraft,
  windowDraft,
} from './capture';
import type { LogDraft } from './types';

function fakeConsole(): ConsoleTarget & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    debug: (...args: unknown[]) => calls.push(`debug:${args.join(' ')}`),
    log: (...args: unknown[]) => calls.push(`log:${args.join(' ')}`),
    info: (...args: unknown[]) => calls.push(`info:${args.join(' ')}`),
    warn: (...args: unknown[]) => calls.push(`warn:${args.join(' ')}`),
    error: (...args: unknown[]) => calls.push(`error:${args.join(' ')}`),
  };
}

describe('kernelEntryDraft', () => {
  it('keeps the kernel entry whole, including its own time', () => {
    const entry: LogEntry = {
      id: 7,
      level: 'warn',
      source: 'session',
      message: 'failed unlock attempt',
      timestamp: 1234,
      data: { attempts: 2 },
    };
    expect(kernelEntryDraft(entry)).toEqual({
      level: 'warn',
      source: 'session',
      message: 'failed unlock attempt',
      timestamp: 1234,
      data: { attempts: 2 },
    });
  });
});

describe('kernel event drafts', () => {
  it('names the app that opened a window', () => {
    expect(windowDraft('open', { windowId: 'w3', pid: 4 }, 'lumen.notes')).toEqual({
      level: 'info',
      source: 'window',
      message: 'window open lumen.notes id=w3',
      data: { windowId: 'w3', pid: 4, appId: 'lumen.notes' },
    });
  });

  it('falls back to the pid when the process is already gone', () => {
    const draft = windowDraft('close', { windowId: 'w3', pid: 4 });
    expect(draft.message).toBe('window close pid=4 id=w3');
    expect(draft.data).toEqual({ windowId: 'w3', pid: 4 });
  });

  it('records a notification without its callback', () => {
    const notification: Notification = {
      id: 'n1',
      appId: 'lumen.notes',
      title: 'Note exported',
      body: 'Ideas.md',
      createdAt: 5,
      read: false,
      actions: [{ id: 'show', label: 'Show' }],
      onAction: () => {},
    };
    expect(notificationDraft(notification)).toEqual({
      level: 'info',
      source: 'notification',
      message: 'lumen.notes: Note exported',
      data: {
        id: 'n1',
        appId: 'lumen.notes',
        title: 'Note exported',
        body: 'Ideas.md',
        actions: ['Show'],
      },
    });
  });

  it('says only what the registry event says', () => {
    expect(appsChangedDraft()).toEqual({
      level: 'info',
      source: 'apps',
      message: 'app registry changed',
    });
  });

  it('records settings and theme changes as debug', () => {
    expect(settingsDraft({ path: 'appearance.theme' })).toEqual({
      level: 'debug',
      source: 'settings',
      message: 'settings appearance.theme',
    });
    expect(themeDraft({ theme: 'dark' }).level).toBe('debug');
  });

  it('records a session transition', () => {
    expect(sessionDraft({ from: 'locked', to: 'desktop' }).message).toBe(
      'session locked -> desktop',
    );
  });
});

describe('errorEventDraft', () => {
  it('names the error and where it was seen', () => {
    const error = new TypeError('x is not a function');
    const draft = errorEventDraft({
      message: 'Uncaught TypeError',
      filename: 'app.ts',
      lineno: 12,
      colno: 3,
      error,
    });
    expect(draft.level).toBe('error');
    expect(draft.source).toBe('runtime');
    expect(draft.message).toBe('TypeError: x is not a function');
    expect(draft.data).toEqual({ at: 'app.ts:12:3', error });
  });

  it('uses the browser message when nothing was thrown with it', () => {
    expect(errorEventDraft({ message: 'Script error.' })).toEqual({
      level: 'error',
      source: 'runtime',
      message: 'Script error.',
      data: undefined,
    });
  });

  it('always has something to say', () => {
    expect(errorEventDraft({}).message).toBe('uncaught error');
  });

  it('records a rejection with its reason', () => {
    const draft = rejectionDraft(new Error('nope'));
    expect(draft.message).toBe('unhandled rejection: Error: nope');
    expect(draft.level).toBe('error');
  });

  it('records a rejection that was not an error', () => {
    expect(rejectionDraft('timeout').message).toBe('unhandled rejection: timeout');
  });
});

describe('consoleDraft', () => {
  it('maps log to info and keeps the other levels', () => {
    expect(consoleDraft('log', ['hi']).level).toBe('info');
    expect(consoleDraft('debug', ['hi']).level).toBe('debug');
    expect(consoleDraft('warn', ['hi']).level).toBe('warn');
    expect(consoleDraft('error', ['hi']).level).toBe('error');
    expect(consoleDraft('info', ['hi']).source).toBe('console');
  });

  it('says which call it was when nothing was printed', () => {
    expect(consoleDraft('log', []).message).toBe('console.log()');
  });
});

describe('patchConsole', () => {
  it('records every method and prints it too', () => {
    const target = fakeConsole();
    const drafts: LogDraft[] = [];
    const restore = patchConsole(target, (draft) => drafts.push(draft));
    target.log('hello', 1);
    target.warn('careful');
    target.error(new Error('bad'));
    restore();
    expect(target.calls).toEqual(['log:hello 1', 'warn:careful', 'error:Error: bad']);
    expect(drafts.map((d) => `${d.level} ${d.message}`)).toEqual([
      'info hello 1',
      'warn careful',
      'error Error: bad',
    ]);
  });

  it('puts every method back exactly as it was', () => {
    const target = fakeConsole();
    const before = { ...target };
    const restore = patchConsole(target, () => {});
    expect(target.log).not.toBe(before.log);
    restore();
    expect(target.log).toBe(before.log);
    expect(target.debug).toBe(before.debug);
    expect(target.info).toBe(before.info);
    expect(target.warn).toBe(before.warn);
    expect(target.error).toBe(before.error);
  });

  it('leaves a method alone when something else replaced it', () => {
    const target = fakeConsole();
    const restore = patchConsole(target, () => {});
    const other = (...args: unknown[]) => target.calls.push(`other:${args.join(' ')}`);
    target.warn = other;
    restore();
    expect(target.warn).toBe(other);
  });

  it('does not wrap a console it already wrapped', () => {
    const target = fakeConsole();
    const first: LogDraft[] = [];
    const second: LogDraft[] = [];
    const restoreFirst = patchConsole(target, (d) => first.push(d));
    const wrapped = target.log;
    const restoreSecond = patchConsole(target, (d) => second.push(d));
    expect(target.log).toBe(wrapped);
    target.log('once');
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    restoreSecond();
    expect(target.log).toBe(wrapped);
    restoreFirst();
  });

  it('still prints when recording throws', () => {
    const target = fakeConsole();
    const restore = patchConsole(target, () => {
      throw new Error('recording failed');
    });
    expect(() => target.log('printed')).not.toThrow();
    expect(target.calls).toEqual(['log:printed']);
    restore();
  });

  it('does not swallow an error thrown by the original', () => {
    const target = fakeConsole();
    target.log = () => {
      throw new Error('console is broken');
    };
    const drafts: LogDraft[] = [];
    const restore = patchConsole(target, (d) => drafts.push(d));
    expect(() => target.log('x')).toThrow('console is broken');
    expect(drafts).toHaveLength(1);
    restore();
  });

  it('does not re-enter when recording prints', () => {
    const target = fakeConsole();
    const drafts: LogDraft[] = [];
    const restore = patchConsole(target, (draft) => {
      drafts.push(draft);
      if (drafts.length < 5) target.warn('from the recorder');
    });
    target.log('start');
    restore();
    expect(drafts).toHaveLength(1);
    expect(target.calls).toEqual(['log:start', 'warn:from the recorder']);
  });

  it('restores after a mount, unmount and mount again', () => {
    const target = fakeConsole();
    const original = target.log;
    const seen = vi.fn();
    patchConsole(target, seen)();
    const restore = patchConsole(target, seen);
    target.log('after remount');
    expect(seen).toHaveBeenCalledTimes(1);
    restore();
    expect(target.log).toBe(original);
  });
});

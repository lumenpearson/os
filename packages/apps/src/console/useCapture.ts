/**
 * The live capture. It subscribes to what the running system actually emits —
 * the kernel's own log, the kernel event bus, uncaught errors, and the
 * console while this window is open — and writes every one into a ring
 * buffer. Nothing here invents an event.
 */
import { events, type LogEntry, useLogStore, useProcessStore } from '@lumen/kernel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RingBuffer } from './buffer';
import {
  appsChangedDraft,
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
import type { LogDraft, LogRecord } from './types';

export interface Capture {
  buffer: RingBuffer<LogRecord>;
  /** Bumps once a frame while records arrive; the key for reading the buffer. */
  version: number;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /** Events that arrived while the capture was paused. */
  skipped: number;
  clear: () => void;
}

function appIdFor(pid: number): string | undefined {
  return useProcessStore.getState().processes[pid]?.appId;
}

export function useCapture(capacity: number): Capture {
  const bufferRef = useRef<RingBuffer<LogRecord> | null>(null);
  if (bufferRef.current === null) bufferRef.current = new RingBuffer<LogRecord>(capacity);
  const buffer = bufferRef.current;

  const [version, setVersion] = useState(0);
  const [paused, setPausedState] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const pausedRef = useRef(false);
  const pendingSkips = useRef(0);
  const frame = useRef(0);
  const seq = useRef(0);

  /**
   * A burst of events must not cost a render each, so the buffer is written
   * synchronously and the view is told about it once a frame.
   */
  const flush = useCallback(() => {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setVersion((current) => current + 1);
      if (pendingSkips.current > 0) {
        const missed = pendingSkips.current;
        pendingSkips.current = 0;
        setSkipped((current) => current + missed);
      }
    });
  }, []);

  const record = useCallback(
    (draft: LogDraft) => {
      if (pausedRef.current) {
        pendingSkips.current += 1;
        flush();
        return;
      }
      seq.current += 1;
      buffer.push({
        id: seq.current,
        timestamp: draft.timestamp ?? Date.now(),
        level: draft.level,
        source: draft.source,
        message: draft.message,
        data: draft.data,
      });
      flush();
    },
    [buffer, flush],
  );

  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // ── the kernel's own log ────────────────────────────────────────────────
  // Read from the top on mount: the boot, the launches and the failures that
  // happened before this window opened are the point of the app.
  const lastKernelId = useRef(0);
  useEffect(() => {
    const take = (entries: readonly LogEntry[]) => {
      for (const entry of entries) {
        if (entry.id <= lastKernelId.current) continue;
        lastKernelId.current = entry.id;
        record(kernelEntryDraft(entry));
      }
    };
    take(useLogStore.getState().entries);
    return useLogStore.subscribe((state, previous) => {
      if (state.entries !== previous.entries) take(state.entries);
    });
  }, [record]);

  // ── the kernel event bus ────────────────────────────────────────────────
  // Only the events the kernel's log does not already carry. Launch and exit
  // are logged by the kernel itself, and focus, activity and display resize
  // fire at pointer rate, so none of them are taken here.
  useEffect(() => {
    const offs = [
      events.on('window:open', (payload) =>
        record(windowDraft('open', payload, appIdFor(payload.pid))),
      ),
      events.on('window:close', (payload) =>
        record(windowDraft('close', payload, appIdFor(payload.pid))),
      ),
      events.on('notification:post', (notification) => record(notificationDraft(notification))),
      events.on('apps:change', () => record(appsChangedDraft())),
      events.on('settings:change', (payload) => record(settingsDraft(payload))),
      events.on('session:change', (payload) => record(sessionDraft(payload))),
      events.on('theme:change', (payload) => record(themeDraft(payload))),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [record]);

  // ── errors nobody caught ────────────────────────────────────────────────
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      record(
        errorEventDraft({
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
        }),
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => record(rejectionDraft(event.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [record]);

  // ── the console, only while this window is open ─────────────────────────
  useEffect(() => patchConsole(globalThis.console, record), [record]);

  const setPaused = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPausedState(next);
    // The count described the pause that just ended.
    if (!next) {
      pendingSkips.current = 0;
      setSkipped(0);
    }
  }, []);

  const clear = useCallback(() => {
    buffer.clear();
    pendingSkips.current = 0;
    setSkipped(0);
    setVersion((current) => current + 1);
  }, [buffer]);

  return useMemo(
    () => ({ buffer, version, paused, setPaused, skipped, clear }),
    [buffer, version, paused, setPaused, skipped, clear],
  );
}

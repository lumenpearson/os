import { create } from 'zustand';
import type { LogEntry, LogLevel } from '../types';

interface LogStore {
  entries: LogEntry[];
  enabled: boolean;
  add: (level: LogLevel, source: string, message: string, data?: unknown) => void;
  clear: () => void;
  setEnabled: (enabled: boolean) => void;
}

const MAX = 2000;
let seq = 0;

export const useLogStore = create<LogStore>((set, get) => ({
  entries: [],
  enabled: true,
  add: (level, source, message, data) => {
    if (!get().enabled && level !== 'error') return;
    const entry: LogEntry = { id: ++seq, level, source, message, timestamp: Date.now(), data };
    set((s) => ({
      entries:
        s.entries.length >= MAX ? [...s.entries.slice(-MAX + 1), entry] : [...s.entries, entry],
    }));
  },
  clear: () => set({ entries: [] }),
  setEnabled: (enabled) => set({ enabled }),
}));

export const log = {
  debug: (source: string, message: string, data?: unknown) =>
    useLogStore.getState().add('debug', source, message, data),
  info: (source: string, message: string, data?: unknown) =>
    useLogStore.getState().add('info', source, message, data),
  warn: (source: string, message: string, data?: unknown) =>
    useLogStore.getState().add('warn', source, message, data),
  error: (source: string, message: string, data?: unknown) =>
    useLogStore.getState().add('error', source, message, data),
};

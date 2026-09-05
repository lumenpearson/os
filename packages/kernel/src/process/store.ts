import { create } from 'zustand';
import { events } from '../events';
import type { AppId, LaunchArgs, Pid, Process, WindowId } from '../types';
import { stepLoad } from './load';

interface ProcessStore {
  processes: Record<Pid, Process>;
  nextPid: Pid;
  spawn: (appId: AppId, name: string, args: LaunchArgs, background?: boolean) => Process;
  exit: (pid: Pid) => void;
  attachWindow: (pid: Pid, windowId: WindowId) => void;
  detachWindow: (pid: Pid, windowId: WindowId) => void;
  /** When the load figures were last stepped, so the model can use real time. */
  tickedAt: number | null;
  /** Step the load model. `now` is injectable so tests do not need a clock. */
  tick: (now?: number) => void;
  findByApp: (appId: AppId) => Process[];
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: {},
  nextPid: 100,
  tickedAt: null,
  spawn: (appId, name, args, background = false) => {
    const pid = get().nextPid;
    const process: Process = {
      pid,
      appId,
      name,
      args,
      startedAt: Date.now(),
      windowIds: [],
      cpu: 0,
      memory: 24 * 1024 * 1024 + Math.round(Math.random() * 40 * 1024 * 1024),
      background,
    };
    set((s) => ({ processes: { ...s.processes, [pid]: process }, nextPid: pid + 1 }));
    events.emit('process:start', { pid, appId, args });
    return process;
  },
  exit: (pid) => {
    const p = get().processes[pid];
    if (!p) return;
    set((s) => {
      const next = { ...s.processes };
      delete next[pid];
      return { processes: next };
    });
    events.emit('process:exit', { pid, appId: p.appId });
  },
  attachWindow: (pid, windowId) =>
    set((s) => {
      const p = s.processes[pid];
      if (!p || p.windowIds.includes(windowId)) return s;
      return {
        processes: { ...s.processes, [pid]: { ...p, windowIds: [...p.windowIds, windowId] } },
      };
    }),
  detachWindow: (pid, windowId) =>
    set((s) => {
      const p = s.processes[pid];
      if (!p) return s;
      return {
        processes: {
          ...s.processes,
          [pid]: { ...p, windowIds: p.windowIds.filter((id) => id !== windowId) },
        },
      };
    }),
  tick: (now = Date.now()) =>
    set((s) => {
      const next: Record<Pid, Process> = {};
      const elapsed = s.tickedAt === null ? 1_000 : Math.max(0, now - s.tickedAt);
      let changed = false;
      for (const p of Object.values(s.processes)) {
        // The model in ./load.ts decides what a process costs from what it is
        // doing: its windows, whether it is in the foreground, how long ago it
        // started. Elapsed time drives the easing, so a tab that was in the
        // background for a minute comes back with the figures it should have.
        const reading = stepLoad(
          { cpu: p.cpu, memory: p.memory },
          {
            windows: p.windowIds.length,
            background: p.background || p.windowIds.length === 0,
            age: Math.max(0, now - p.startedAt),
          },
          elapsed,
          Math.random(),
        );
        const memory = reading.memory;
        const rounded = reading.cpu;
        // Hand back the same object when neither reading moved. Every consumer
        // of useProcesses() compares by reference, so replacing an unchanged
        // process re-renders the taskbar — which only reads appId and pid —
        // twice a minute for nothing.
        next[p.pid] = rounded === p.cpu && memory === p.memory ? p : { ...p, cpu: rounded, memory };
        if (next[p.pid] !== p) changed = true;
      }
      if (!changed) return { tickedAt: now };
      return { processes: next, tickedAt: now };
    }),
  findByApp: (appId) => Object.values(get().processes).filter((p) => p.appId === appId),
}));

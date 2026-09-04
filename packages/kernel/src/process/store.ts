import { create } from 'zustand';
import { events } from '../events';
import type { AppId, LaunchArgs, Pid, Process, WindowId } from '../types';

interface ProcessStore {
  processes: Record<Pid, Process>;
  nextPid: Pid;
  spawn: (appId: AppId, name: string, args: LaunchArgs, background?: boolean) => Process;
  exit: (pid: Pid) => void;
  attachWindow: (pid: Pid, windowId: WindowId) => void;
  detachWindow: (pid: Pid, windowId: WindowId) => void;
  /** Simulated load tick for the browser build. */
  tick: () => void;
  findByApp: (appId: AppId) => Process[];
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: {},
  nextPid: 100,
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
  tick: () =>
    set((s) => {
      const next: Record<Pid, Process> = {};
      for (const p of Object.values(s.processes)) {
        const target = p.windowIds.length > 0 ? 1.5 + Math.random() * 6 : 0.2 + Math.random();
        const cpu = Math.max(
          0,
          Math.min(100, p.cpu + (target - p.cpu) * 0.4 + (Math.random() - 0.5) * 2),
        );
        const memory = Math.max(
          8 * 1024 * 1024,
          p.memory + Math.round((Math.random() - 0.5) * 512 * 1024),
        );
        next[p.pid] = { ...p, cpu: Math.round(cpu * 10) / 10, memory };
      }
      return { processes: next };
    }),
  findByApp: (appId) => Object.values(get().processes).filter((p) => p.appId === appId),
}));

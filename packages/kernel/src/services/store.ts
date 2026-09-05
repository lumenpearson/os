/**
 * Which services are running.
 *
 * The catalogue says what exists; this says what is up. Services that start at
 * boot or at login come up when the kernel boots, the rest wait to be asked.
 * Stopping one is allowed unless the system depends on it, and a service that
 * others require takes them with it — the same rule a real service manager
 * applies, and the reason the task manager can explain a refusal.
 */

import { create } from 'zustand';
import { events } from '../events';
import { autostartServices, SERVICES, serviceById } from './catalogue';
import type { ServiceState, ServiceStatus } from './types';

/** Services the rest of the system cannot do without. */
const ESSENTIAL = new Set([
  'com.lumen.kernel',
  'com.lumen.windowserver',
  'com.lumen.processmanager',
  'com.lumen.settingsd',
  'com.lumen.eventbus',
  'com.lumen.sessiond',
  'com.lumen.launchd',
  'com.lumen.vfsd',
]);

export interface ServiceStore {
  statuses: Record<string, ServiceStatus>;
  /** Bring up everything that starts by itself. Called once, at boot. */
  boot: (now: number) => void;
  start: (id: string, now: number) => boolean;
  stop: (id: string) => boolean;
  restart: (id: string, now: number) => boolean;
  running: () => readonly ServiceStatus[];
  isEssential: (id: string) => boolean;
}

function initial(): Record<string, ServiceStatus> {
  const statuses: Record<string, ServiceStatus> = {};
  for (const service of SERVICES) {
    const state: ServiceState = service.startup === 'manual' ? 'stopped' : 'on-demand';
    statuses[service.id] = { id: service.id, state, startedAt: null };
  }
  return statuses;
}

export const useServiceStore = create<ServiceStore>((set, get) => ({
  statuses: initial(),
  boot: (now) =>
    set(() => {
      const statuses = initial();
      for (const service of autostartServices()) {
        statuses[service.id] = { id: service.id, state: 'running', startedAt: now };
      }
      return { statuses };
    }),
  start: (id, now) => {
    if (!serviceById(id)) return false;
    set((s) => ({
      statuses: { ...s.statuses, [id]: { id, state: 'running', startedAt: now } },
    }));
    events.emit('service:start', { id });
    return true;
  },
  stop: (id) => {
    const service = serviceById(id);
    if (!service || ESSENTIAL.has(id)) return false;
    const dependants = SERVICES.filter((other) => other.requires?.includes(id)).map((o) => o.id);
    set((s) => {
      const statuses = { ...s.statuses };
      for (const target of [id, ...dependants]) {
        statuses[target] = { id: target, state: 'stopped', startedAt: null };
      }
      return { statuses };
    });
    events.emit('service:stop', { id });
    return true;
  },
  restart: (id, now) => {
    if (!serviceById(id)) return false;
    get().stop(id);
    return get().start(id, now);
  },
  running: () => Object.values(get().statuses).filter((s) => s.state === 'running'),
  isEssential: (id) => ESSENTIAL.has(id),
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { autostartServices, SERVICES, serviceById, servicesByCategory } from './catalogue';
import { useServiceStore } from './store';

beforeEach(() => useServiceStore.getState().boot(1_000));

describe('the catalogue', () => {
  it('gives every service its own id, a name and a sentence', () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const service of SERVICES) {
      expect(service.id.startsWith('com.lumen.')).toBe(true);
      expect(service.name).toMatch(/^[A-Z]/);
      expect(service.description.endsWith('.')).toBe(true);
    }
  });

  it('covers every category, so no part of the system is unaccounted for', () => {
    for (const category of [
      'core',
      'shell',
      'files',
      'network',
      'input',
      'media',
      'printing',
      'security',
      'sync',
      'maintenance',
      'accessibility',
      'developer',
    ] as const) {
      expect(servicesByCategory(category).length, category).toBeGreaterThan(0);
    }
  });

  it('says which services are real code and which are declared', () => {
    const implemented = SERVICES.filter((s) => s.implemented);
    // The claim has to be worth something in both directions.
    expect(implemented.length).toBeGreaterThan(10);
    expect(implemented.length).toBeLessThan(SERVICES.length);
    expect(serviceById('com.lumen.windowserver')?.implemented).toBe(true);
    expect(serviceById('com.lumen.printd')?.implemented).toBe(false);
  });

  it('starts the boot services before the login ones', () => {
    const order = autostartServices().map((s) => s.startup);
    expect(order).toEqual([...order].sort((a, b) => (a === b ? 0 : a === 'boot' ? -1 : 1)));
    expect(autostartServices().every((s) => s.startup !== 'manual')).toBe(true);
  });

  it('points most services at the settings page that configures them', () => {
    const withSection = SERVICES.filter((s) => s.settingsSection);
    expect(withSection.length).toBeGreaterThan(SERVICES.length / 2);
  });
});

describe('the service store', () => {
  it('brings up everything that starts by itself, and only that', () => {
    const running = useServiceStore.getState().running();
    expect(running.length).toBe(autostartServices().length);
    expect(running.every((s) => s.startedAt === 1_000)).toBe(true);
    expect(useServiceStore.getState().statuses['com.lumen.printd']?.state).toBe('on-demand');
  });

  it('starts and stops a service that may be stopped', () => {
    const store = useServiceStore.getState();
    expect(store.stop('com.lumen.spelld')).toBe(true);
    expect(useServiceStore.getState().statuses['com.lumen.spelld']?.state).toBe('stopped');
    expect(store.start('com.lumen.spelld', 2_000)).toBe(true);
    expect(useServiceStore.getState().statuses['com.lumen.spelld']?.startedAt).toBe(2_000);
  });

  it('refuses to stop the ones the system is standing on', () => {
    const store = useServiceStore.getState();
    for (const id of ['com.lumen.kernel', 'com.lumen.windowserver', 'com.lumen.vfsd']) {
      expect(store.stop(id), id).toBe(false);
      expect(useServiceStore.getState().statuses[id]?.state).toBe('running');
      expect(store.isEssential(id)).toBe(true);
    }
  });

  it('knows nothing of a service that was never declared', () => {
    const store = useServiceStore.getState();
    expect(store.start('com.lumen.nonsense', 1)).toBe(false);
    expect(store.stop('com.lumen.nonsense')).toBe(false);
  });

  it('restarts a service by stopping it and starting it again', () => {
    const store = useServiceStore.getState();
    expect(store.restart('com.lumen.dock', 5_000)).toBe(true);
    expect(useServiceStore.getState().statuses['com.lumen.dock']).toEqual({
      id: 'com.lumen.dock',
      state: 'running',
      startedAt: 5_000,
    });
  });
});

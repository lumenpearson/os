import { describe, expect, it } from 'vitest';
import { detectPlatformKind } from './detect';
import { createWebPlatform } from './web';

describe('web platform', () => {
  it('detects the browser runtime', () => {
    expect(detectPlatformKind()).toBe('web');
  });

  it('reports system info and simulated metrics', async () => {
    const platform = createWebPlatform('1.2.3');
    const info = await platform.system.info();
    expect(info.host).toBe('web');
    expect(info.appVersion).toBe('1.2.3');
    expect(info.cpu.cores).toBeGreaterThan(0);
    const m = await platform.system.metrics();
    expect(m.cpu).toBeGreaterThanOrEqual(0);
    expect(m.cpu).toBeLessThanOrEqual(100);
    expect(m.perCore).toHaveLength(info.cpu.cores);
    expect(m.memory.used).toBeLessThan(m.memory.total);
  });

  it('persists host config', async () => {
    const platform = createWebPlatform();
    await platform.config.set({ fullscreen: true });
    expect((await platform.config.get()).fullscreen).toBe(true);
    expect(platform.capabilities.hostProcesses).toBe(false);
  });
});

describe('the interface it is running', () => {
  it('reports the version it was given and nothing to patch', async () => {
    // A web Lumen is served fresh, so the version running is the only
    // version there is. Reporting that plainly is what lets Settings say so
    // instead of showing a control that cannot do anything.
    const platform = createWebPlatform('1.2.3');
    const state = await platform.interface.state();
    expect(state).toEqual({
      version: null,
      host: '1.2.3',
      previous: null,
      rolledBackFrom: null,
    });
  });

  it('takes the ready report without a host to send it to', async () => {
    await expect(createWebPlatform().interface.ready()).resolves.toBeUndefined();
  });
});

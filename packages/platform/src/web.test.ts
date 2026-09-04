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

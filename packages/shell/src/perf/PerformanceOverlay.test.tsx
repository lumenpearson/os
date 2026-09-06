import { createKernel, type Kernel, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PerformanceOverlay } from './PerformanceOverlay';

let kernel: Kernel;

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
});

afterEach(cleanup);

function show() {
  render(
    <KernelProvider kernel={kernel}>
      <PerformanceOverlay />
    </KernelProvider>,
  );
}

describe('the performance overlay', () => {
  it('stays out of the way until it is switched on', () => {
    show();
    expect(screen.queryByTestId('performance-overlay')).toBeNull();
  });

  it('appears when Settings asks for it, and takes no pointer events', async () => {
    useSettingsStore.getState().patch('display', { performanceOverlay: true });
    show();
    const overlay = screen.getByTestId('performance-overlay');
    expect(overlay).toBeInTheDocument();
    // It sits over the windows; a click meant for one must pass through it.
    expect(overlay.className).toContain('pointer-events-none');
  });

  it('shows a dash for every figure until it has measured one', async () => {
    useSettingsStore.getState().patch('display', { performanceOverlay: true });
    show();
    // happy-dom runs no frames, so nothing has been measured — and the
    // overlay says so rather than showing a zero that would read as a stall.
    expect(screen.getByTestId('performance-overlay').textContent).not.toContain('0');
  });
});

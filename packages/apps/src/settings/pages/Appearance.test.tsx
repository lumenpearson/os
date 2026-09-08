import { createKernel, type Kernel, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppearancePage } from './Appearance';

let kernel: Kernel;

const appearance = () => useSettingsStore.getState().settings.appearance;

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  render(
    <KernelProvider kernel={kernel}>
      <AppearancePage />
    </KernelProvider>,
  );
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('AppearancePage', () => {
  it('writes the blur the slider is moved to, in pixels', () => {
    fireEvent.change(screen.getByRole('slider', { name: 'Blur' }), { target: { value: '24' } });
    expect(appearance().blur).toBe(24);
    expect(screen.getByText('24 px')).toBeInTheDocument();
  });

  it('goes to zero, which leaves the surfaces opaque', () => {
    fireEvent.change(screen.getByRole('slider', { name: 'Blur' }), { target: { value: '0' } });
    expect(appearance().blur).toBe(0);
    expect(screen.getByText('0 px')).toBeInTheDocument();
    expect(screen.getByText(/leaves those surfaces opaque/)).toBeInTheDocument();
  });

  it('takes the blur out of reach while transparency is reduced', async () => {
    const user = userEvent.setup();
    expect(screen.getByRole('slider', { name: 'Blur' })).toBeEnabled();
    await user.click(screen.getByRole('switch', { name: 'Reduce transparency' }));
    expect(appearance().reduceTransparency).toBe(true);
    expect(screen.getByRole('slider', { name: 'Blur' })).toBeDisabled();
  });
});

import { createKernel, type Kernel, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_ROWS, searchSettings } from '../sections';
import { DisplayPage } from './Display';

let kernel: Kernel;
let container: HTMLElement;

const windows = () => useSettingsStore.getState().settings.windows;

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  const view = render(
    <KernelProvider kernel={kernel}>
      <DisplayPage />
    </KernelProvider>,
  );
  container = view.container;
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('DisplayPage', () => {
  it('writes the tiling gap the slider is moved to', () => {
    const slider = screen.getByRole('slider', { name: 'Gap between tiled windows' });
    expect(windows().tilingGap).toBe(0);
    fireEvent.change(slider, { target: { value: '12' } });
    expect(windows().tilingGap).toBe(12);
    expect(screen.getByText('12 px')).toBeInTheDocument();
  });

  it('turns off covering the panels', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'Cover the panels' }));
    expect(windows().fullscreenCoversPanels).toBe(false);
  });

  it('turns off hiding the title bar', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'Hide the title bar' }));
    expect(windows().fullscreenHidesTitleBar).toBe(false);
  });

  it('disables the two immersive switches when full screen stops at the panels', async () => {
    const user = userEvent.setup();
    const menubar = screen.getByRole('switch', { name: 'Slide the menubar away' });
    expect(menubar).toBeEnabled();
    await user.click(screen.getByRole('switch', { name: 'Cover the panels' }));
    expect(menubar).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Slide the taskbar away' })).toBeDisabled();
  });

  it('renders a row for every indexed row id, and indexes every row it renders', () => {
    const indexed = SETTINGS_ROWS.filter((r) => r.section === 'display').map((r) => r.id);
    const rendered = [...container.querySelectorAll('[data-row]')].map((el) =>
      el.getAttribute('data-row'),
    );
    expect([...indexed].sort()).toEqual([...rendered].sort());
  });

  it('takes the search to rows that exist on the page', () => {
    const result = searchSettings('tiling').find((r) => r.section.id === 'display');
    expect(result?.rows).toContain('display.tilingGap');
    for (const id of result?.rows ?? []) {
      expect(container.querySelector(`[data-row="${id}"]`)).not.toBeNull();
    }
  });
});

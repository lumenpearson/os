/**
 * The Slides window from the outside. The deck reducer, the layouts and the
 * export have their own tests next door; these cover the row along the top,
 * which is now the only thing naming the window.
 */

import { createKernel, type Kernel } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Slides from './Slides';

let kernel: Kernel;

const DECK = {
  version: 1,
  title: 'Quarter Review',
  slides: [{ id: 's1', layout: 'title', title: 'Quarter Review', bullets: [] }],
};

function mount(args: Record<string, unknown> = {}) {
  return render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: 1, windowId: 'w1', appId: 'lumen.slides', container: null }}>
        <DialogProvider container={null}>
          <FileDialogProvider>
            <Slides pid={1} windowId="w1" args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
}

beforeEach(() => {
  const platform = { ...createWebPlatform(), adapter: new MemoryAdapter() };
  kernel = createKernel({ platform, apps: [] });
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('the inset title bar', () => {
  /** The row the close, minimize and zoom controls are drawn over. */
  const firstRow = () => screen.getAllByRole('toolbar')[0] as HTMLElement;

  it('keeps the width of the window controls clear at the start of the row', () => {
    expect(definition.window.titleBar).toBe('inset');
    mount();
    expect(firstRow().className).toContain('ps-(--lumen-window-controls-w)');
  });

  it('names an unsaved deck in the row, as the title bar used to', () => {
    mount();
    expect(within(firstRow()).getByText('Untitled')).toBeInTheDocument();
  });

  it('names the open deck in the row', async () => {
    await kernel.vfs.writeJson('/Documents/Quarter Review.lsl', DECK, { recursive: true });
    mount({ path: '/Documents/Quarter Review.lsl' });
    expect(await within(firstRow()).findByText('Quarter Review.lsl')).toBeInTheDocument();
  });

  it('keeps the slide commands beside the name', () => {
    mount();
    const row = within(firstRow());
    expect(row.getByRole('button', { name: 'New Slide' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Duplicate slide' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Present' })).toBeInTheDocument();
  });
});

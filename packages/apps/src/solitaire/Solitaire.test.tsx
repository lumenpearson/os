/**
 * The Solitaire window from the outside. The deal, the rules and the table
 * are tested next door without a screen; this covers the row along the top,
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
import Solitaire from './Solitaire';

let kernel: Kernel;

function mount() {
  return render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: 1, windowId: 'w1', appId: 'lumen.solitaire', container: null }}>
        <DialogProvider container={null}>
          <FileDialogProvider>
            <Solitaire pid={1} windowId="w1" args={{}} />
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

  it('names the game in the row, as the title bar used to', () => {
    mount();
    expect(within(firstRow()).getByText('Solitaire')).toBeInTheDocument();
  });

  it('keeps the deal commands beside the name', () => {
    mount();
    const row = within(firstRow());
    expect(row.getByRole('button', { name: 'New Deal' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });
});

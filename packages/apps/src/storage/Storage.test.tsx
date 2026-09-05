import { createKernel, type Kernel, useMenuStore, useProcessStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../_sdk';
import { fromCacheRecord } from './cache';
import definition from './index';
import Storage from './Storage';

const filesStub = {
  ...definition,
  id: 'lumen.files',
  name: 'Files',
  singleton: false,
  component: () => null,
};

describe('the Storage window', () => {
  let kernel: Kernel;
  let windowId: string;
  let home: string;

  beforeEach(async () => {
    const platform = createWebPlatform();
    kernel = createKernel({
      platform: { ...platform, adapter: new MemoryAdapter() },
      apps: [{ ...definition, component: () => null }, filesStub],
      autoSetup: { name: 'Ada Lovelace' },
    });
    await kernel.boot();
    home = kernel.home;
    await kernel.vfs.writeText(join(home, 'Pictures', 'wide.png'), 'p'.repeat(4000));
    await kernel.vfs.writeText(join(home, 'Videos', 'clip.mp4'), 'v'.repeat(9000));
    await kernel.vfs.writeText(join(home, 'Documents', 'letter.txt'), 'd'.repeat(500));
    await kernel.vfs.writeText('/Trash/old.zip', 'z'.repeat(2000));

    const process = kernel.launch('lumen.storage');
    if (!process) throw new Error('failed to launch');
    windowId = process.windowIds[0] as string;
    render(
      <KernelProvider kernel={kernel}>
        <AppProvider
          value={{ pid: process.pid, windowId, appId: 'lumen.storage', container: null }}
        >
          <DialogProvider>
            <Storage pid={process.pid} windowId={windowId} args={{}} />
          </DialogProvider>
        </AppProvider>
      </KernelProvider>,
    );
    await screen.findByRole('heading', { name: 'What is stored' }, { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId).toBeDefined());
  });

  afterEach(cleanup);

  it('breaks the scanned files down by category', async () => {
    await waitFor(() => {
      expect(document.querySelector('[data-segment="video"]')).toBeInTheDocument();
    });
    const video = document.querySelector('[data-segment="video"]');
    expect(video?.textContent).toContain('Video');
    expect(video?.textContent).toContain('8.8 KB');
    expect(document.querySelector('[data-segment="pictures"]')?.textContent).toContain('3.9 KB');
    expect(document.querySelector('[data-segment="trash"]')?.textContent).toContain('Trash');
  });

  it('reports the file system figure and says why there is no quota', async () => {
    await waitFor(() => {
      expect(document.querySelector('[data-reading="Used"]')).toHaveAttribute(
        'data-available',
        'true',
      );
    });
    const quota = document.querySelector('[data-reading="Quota"]');
    expect(quota).toHaveAttribute('data-available', 'false');
    expect(quota?.textContent).toContain('—');
    expect(quota?.textContent).toContain('reports no limit');
  });

  it('does not pass the browser storage estimate off as this file system', () => {
    const browser = document.querySelector('[data-reading="Browser estimate"]');
    expect(browser).toHaveAttribute('data-available', 'false');
    expect(browser?.textContent).toContain('—');
  });

  it('says where the figures came from', () => {
    expect(screen.getByText(/Measured by the memory file system/)).toBeInTheDocument();
  });

  it('contributes File and View menus', () => {
    expect(useMenuStore.getState().byWindow[windowId]?.map((m) => m.label)).toEqual([
      'File',
      'View',
    ]);
  });

  it('counts what it scanned in the status bar', async () => {
    await waitFor(() => expect(screen.getByText(/files ·/)).toBeInTheDocument());
  });

  it('lists the largest files with their size and date', async () => {
    await userEvent.click(screen.getByRole('radio', { name: 'Largest Files' }));
    const grid = screen.getByRole('grid');
    await waitFor(() => {
      expect(within(grid).getByText('Videos/clip.mp4')).toBeInTheDocument();
    });
    expect(within(grid).getByText('8.8 KB')).toBeInTheDocument();
  });

  it('reveals a file in Files', async () => {
    await userEvent.click(screen.getByRole('radio', { name: 'Largest Files' }));
    await userEvent.click(await screen.findByText('Videos/clip.mp4'));
    await userEvent.click(screen.getByRole('button', { name: 'Reveal in Files' }));
    const running = Object.values(useProcessStore.getState().processes).map((p) => p.appId);
    expect(running).toContain('lumen.files');
  });

  it('moves a file to the Trash and stops listing it', async () => {
    await userEvent.click(screen.getByRole('radio', { name: 'Largest Files' }));
    await userEvent.click(await screen.findByText('Videos/clip.mp4'));
    await userEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    await waitFor(async () => {
      expect(await kernel.vfs.exists(join(home, 'Videos', 'clip.mp4'))).toBe(false);
    });
    await waitFor(() => {
      expect(screen.queryByText('Videos/clip.mp4')).not.toBeInTheDocument();
    });
  });

  it('draws a treemap of the home folder that takes focus', async () => {
    await userEvent.click(screen.getByRole('radio', { name: 'By Folder' }));
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toHaveAttribute('tabindex', '0');
    // Files calls this folder "Home" in its breadcrumbs, and the treemap says
    // the same rather than printing the account directory's own name.
    expect(listbox.getAttribute('aria-label')).toContain('Home');
  });

  it('keeps the finished scan so the next window has figures at once', async () => {
    await waitFor(
      async () => {
        const record = await kernel.vfs.readJson(join(home, '.config', 'storage.json'));
        expect(fromCacheRecord(record, home)?.files.length).toBeGreaterThan(3);
      },
      { timeout: 4000 },
    );
  });

  it('empties the Trash after asking', async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Empty Trash' }));
    // The confirm carries the same name as the button that opened it, which is
    // right — it says what it will do — so the confirmation has to be found
    // inside the dialog rather than by name across the whole window.
    const confirm = await screen.findByRole('dialog');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Empty Trash' }));
    await waitFor(async () => {
      expect(await kernel.vfs.readDir('/Trash')).toHaveLength(1);
    });
  });
});

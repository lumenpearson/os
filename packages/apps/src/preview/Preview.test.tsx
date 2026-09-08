import {
  type AppDefinition,
  createKernel,
  type Kernel,
  useMenuStore,
  useWindowStore,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Preview from './Preview';

const Dummy = () => null;
const files: AppDefinition = {
  id: 'lumen.files',
  name: 'Files',
  description: 'Browse files',
  category: 'system',
  icon: Dummy,
  component: Dummy,
  window: { width: 600, height: 400 },
};

let kernel: Kernel;
/** Fixtures live in their own folder so the sequence is predictable. */
let folder: string;

function mount(path: string) {
  const process = kernel.launch('lumen.preview', { path });
  if (!process) throw new Error('failed to launch');
  const windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.preview', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Preview pid={process.pid} windowId={windowId} args={{ path }} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, windowId, pid: process.pid };
}

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }, files],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  folder = join(kernel.home, 'Cases');
  await kernel.vfs.ensureDir(folder);
  await kernel.vfs.writeText(join(folder, 'a-notes.md'), '# Heading\n\nA paragraph.\n');
  await kernel.vfs.writeText(join(folder, 'b-data.json'), '{"name":"ada","tags":["one","two"]}');
  await kernel.vfs.writeText(
    join(folder, 'c-rows.csv'),
    'city,people\nOslo,700000\nBergen,280000\n',
  );
  await kernel.vfs.writeText(join(folder, 'd-plain.txt'), 'first line\nsecond line\n');
  await kernel.vfs.writeFile(
    join(folder, 'e-bundle.zip'),
    Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
  );
});

afterEach(() => {
  cleanup();
  kernel.dispose();
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
});

describe('Preview', () => {
  it('shows a plain text file as it was written', async () => {
    mount(join(folder, 'd-plain.txt'));
    expect(await screen.findByText(/first line/)).toBeInTheDocument();
  });

  it('renders Markdown rather than its source', async () => {
    mount(join(folder, 'a-notes.md'));
    expect(await screen.findByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.queryByText('# Heading')).not.toBeInTheDocument();
  });

  it('reads the file into the status bar', async () => {
    mount(join(folder, 'd-plain.txt'));
    await screen.findByText(/first line/);
    await waitFor(() => expect(screen.getByText('23 B')).toBeInTheDocument());
    expect(screen.getByText('Plain Text')).toBeInTheDocument();
    expect(screen.getByText('d-plain.txt')).toBeInTheDocument();
  });

  it('titles the window after the file', async () => {
    const { windowId } = mount(join(folder, 'd-plain.txt'));
    await waitFor(() =>
      expect(useWindowStore.getState().windows[windowId]?.title).toBe('d-plain.txt'),
    );
  });

  it('gives JSON a tree that the arrow keys walk', async () => {
    const user = userEvent.setup();
    mount(join(folder, 'b-data.json'));
    const tree = await screen.findByRole('tree');
    const rows = within(tree).getAllByRole('treeitem');
    expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
    expect(within(tree).getByText('name')).toBeInTheDocument();

    tree.focus();
    await user.keyboard('{ArrowDown}');
    const second = within(tree).getAllByRole('treeitem')[1];
    expect(tree).toHaveAttribute('aria-activedescendant', second?.id);
  });

  it('closes and opens a branch on Enter', async () => {
    const user = userEvent.setup();
    mount(join(folder, 'b-data.json'));
    const tree = await screen.findByRole('tree');
    expect(within(tree).getByText('"one"')).toBeInTheDocument();

    tree.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(within(tree).queryByText('"one"')).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(within(tree).getByText('"one"')).toBeInTheDocument();
  });

  it('falls back to the text when the JSON does not parse', async () => {
    await kernel.vfs.writeText(join(folder, 'broken.json'), '{ nope');
    mount(join(folder, 'broken.json'));
    expect(await screen.findByText('{ nope')).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('puts the first CSV row in the header', async () => {
    mount(join(folder, 'c-rows.csv'));
    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['#', 'city', 'people']);
    expect(within(table).getByText('Bergen')).toBeInTheDocument();
  });

  it('names the type and size of a file it cannot read', async () => {
    mount(join(folder, 'e-bundle.zip'));
    expect(await screen.findByText('Preview cannot read this file')).toBeInTheDocument();
    // Named in the panel and again in the status bar.
    expect(screen.getAllByText('ZIP Archive')).toHaveLength(2);
    expect(screen.getAllByText('4 B')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reveal in Files' }).length).toBeGreaterThan(0);
  });

  it('steps through the previewable files in the folder', async () => {
    const user = userEvent.setup();
    mount(join(folder, 'a-notes.md'));
    expect(await screen.findByText('1 of 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('2 of 4')).toBeInTheDocument();
    expect(await screen.findByRole('tree')).toBeInTheDocument();
  });

  it('stops at the first file rather than wrapping', async () => {
    mount(join(folder, 'a-notes.md'));
    await screen.findByText('1 of 4');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('contributes File and View to the menubar', async () => {
    const { windowId } = mount(join(folder, 'd-plain.txt'));
    await waitFor(() => {
      const menus = useMenuStore.getState().byWindow[windowId];
      expect(menus?.map((menu) => menu.label)).toEqual(['File', 'View']);
    });
  });

  it('puts a picture on a stage with the file name on it', async () => {
    // A 1x1 PNG: enough for the stage to hold a real <img> for the file.
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await kernel.vfs.writeFile(join(folder, 'f-shot.png'), png);
    mount(join(folder, 'f-shot.png'));
    expect(await screen.findByRole('img', { name: 'f-shot.png' })).toBeInTheDocument();
  });

  it('goes full screen on F and comes back on Escape', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(join(folder, 'd-plain.txt'));
    await screen.findByText(/first line/);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();

    await user.keyboard('f');
    await waitFor(() => expect(useWindowStore.getState().windows[windowId]?.fullscreen).toBe(true));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(useWindowStore.getState().windows[windowId]?.fullscreen).toBe(false),
    );
  });

  it('dumps a binary file as hex', async () => {
    const blob = Uint8Array.from([0x00, 0x01, 0x02, 0x41, 0x42, 0x43, 0x00, 0xff]);
    await kernel.vfs.writeFile(join(folder, 'g-blob.bin'), blob);
    mount(join(folder, 'g-blob.bin'));
    expect(await screen.findByText('00000000')).toBeInTheDocument();
    expect(screen.getByText(/00 01 02 41 42 43 00 FF/)).toBeInTheDocument();
    expect(screen.getByText(/8 bytes, 16 per row/)).toBeInTheDocument();
  });

  it('gives audio a transport of its own', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeFile(join(folder, 'h-tone.mp3'), Uint8Array.from([0x49, 0x44, 0x33]));
    mount(join(folder, 'h-tone.mp3'));
    const play = await screen.findByRole('button', { name: 'Play' });
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
    await user.click(play);
  });

  it('offers no zoom controls for a file with no pixels', async () => {
    mount(join(folder, 'd-plain.txt'));
    await screen.findByText(/first line/);
    expect(screen.queryByRole('button', { name: 'Zoom In' })).not.toBeInTheDocument();
  });
});

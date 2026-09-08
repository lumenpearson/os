import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import MediaPlayer from './MediaPlayer';

const Dummy = () => null;

let kernel: Kernel;
let home: string;

function mount(args: { path?: string; paths?: string[] } = {}) {
  const process = kernel.launch('lumen.media', args);
  if (!process) throw new Error('failed to launch');
  const windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.media', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <MediaPlayer pid={process.pid} windowId={windowId} args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, windowId };
}

function menuItem(windowId: string, menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`no ${menu} > ${id}`);
  return item;
}

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  await kernel.vfs.writeFile(join(home, 'Music', 'rain.mp3'), new Uint8Array([1, 2, 3]), {
    recursive: true,
  });
  await kernel.vfs.writeFile(join(home, 'Music', 'walk.mp4'), new Uint8Array([4, 5, 6]), {
    recursive: true,
  });
});

describe('MediaPlayer', () => {
  it('offers nothing to play until something is queued', async () => {
    mount();
    expect(await screen.findByText('Nothing queued')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next track' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Playback position' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('queues the files it was launched with and names the one that is loaded', async () => {
    const path = join(home, 'Music', 'rain.mp3');
    mount({ path });

    expect(await screen.findByRole('heading', { name: 'rain.mp3' })).toBeInTheDocument();
    expect(screen.getByText(join(home, 'Music'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove rain.mp3' })).toBeInTheDocument();
  });

  it('keeps the playlist in the home directory between windows', async () => {
    const path = join(home, 'Music', 'rain.mp3');
    const first = mount({ path });
    await screen.findByRole('heading', { name: 'rain.mp3' });
    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<{ queue: { tracks: Array<{ path: string }> } }>(
        join(home, '.config', 'media.json'),
      );
      expect(stored.queue.tracks[0]?.path).toBe(path);
    });
    first.unmount();

    mount();
    expect(await screen.findByRole('heading', { name: 'rain.mp3' })).toBeInTheDocument();
  });

  it('answers the keys a player is expected to answer', async () => {
    const user = userEvent.setup();
    mount({ path: join(home, 'Music', 'rain.mp3') });
    await screen.findByRole('heading', { name: 'rain.mp3' });

    await user.keyboard('m');
    expect(await screen.findByRole('button', { name: 'Unmute' })).toBeInTheDocument();
    await user.keyboard('m');
    expect(await screen.findByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  it('leaves the keys alone while a control has them', async () => {
    const user = userEvent.setup();
    mount({ path: join(home, 'Music', 'rain.mp3') });
    await screen.findByRole('heading', { name: 'rain.mp3' });

    await user.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(screen.getByRole('button', { name: 'Shuffle' })).toHaveFocus();
    await user.keyboard('m');
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  it('reorders and removes queued tracks from the keyboard', async () => {
    const user = userEvent.setup();
    mount({ paths: [join(home, 'Music', 'rain.mp3'), join(home, 'Music', 'walk.mp4')] });
    await screen.findByRole('button', { name: 'Remove walk.mp4' });
    const order = () =>
      Array.from(document.querySelectorAll('li')).map((row) => row.textContent?.trim());
    expect(order()).toEqual(['rain.mp3', 'walk.mp4']);

    screen.getByRole('button', { name: 'walk.mp4' }).focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await waitFor(() => expect(order()).toEqual(['walk.mp4', 'rain.mp3']));

    screen.getByRole('button', { name: 'rain.mp3' }).focus();
    await user.keyboard('{Delete}');
    await waitFor(() => expect(order()).toEqual(['walk.mp4']));
  });

  it('contributes its menus and clears the playlist from one', async () => {
    const { windowId } = mount({ paths: [join(home, 'Music', 'rain.mp3')] });
    await screen.findByRole('heading', { name: 'rain.mp3' });

    expect(menuItem(windowId, 'playback', 'toggle').label).toBe('Play');
    menuItem(windowId, 'file', 'clear').onSelect?.();
    expect(await screen.findByText('Nothing queued')).toBeInTheDocument();
    expect(screen.getByText('Empty playlist')).toBeInTheDocument();
  });

  it('shows the video stage for a film and the sound panel for a track', async () => {
    const { unmount } = mount({ path: join(home, 'Music', 'walk.mp4') });
    await waitFor(() => expect(screen.queryByText('Nothing queued')).not.toBeInTheDocument());
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.controls).toBe(false);
    unmount();

    mount({ path: join(home, 'Music', 'rain.mp3') });
    expect(await screen.findByRole('heading', { name: 'rain.mp3' })).toBeInTheDocument();
  });
});

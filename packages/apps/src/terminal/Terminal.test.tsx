import { createKernel, useSessionStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../_sdk';
import Terminal from './Terminal';

const HOME = '/Users/adalovelace';

async function mount(args: Record<string, unknown> = {}) {
  const platform = { ...createWebPlatform(), adapter: new MemoryAdapter() };
  const kernel = createKernel({ platform, apps: [], autoSetup: { name: 'Ada Lovelace' } });
  await kernel.boot();
  useSessionStore.getState().transition('desktop');
  await kernel.vfs.writeText(`${HOME}/Documents/notes.txt`, 'alpha\nbeta\n');

  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: 1, windowId: 'w1', appId: 'lumen.terminal', container: null }}>
        <Terminal pid={1} windowId="w1" args={args} />
      </AppProvider>
    </KernelProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Command' }) as HTMLInputElement;
  return { kernel, view, input };
}

// The shared vitest config runs with globals: false, so RTL's automatic
// cleanup is not registered; unmount between tests explicitly.
afterEach(cleanup);

/** Type a command and press Enter. */
async function submit(input: HTMLInputElement, text: string) {
  await userEvent.click(input);
  await userEvent.paste(text);
  await userEvent.keyboard('{Enter}');
}

describe('Terminal', () => {
  it('shows the banner and a prompt', async () => {
    await mount();
    const log = screen.getByRole('log', { name: 'Terminal output' });
    await waitFor(() => expect(log.textContent).toContain('type help'));
    expect(log.textContent).toContain('adalovelace@lumen');
  });

  it('runs a command and prints its output', async () => {
    const { input } = await mount();
    await submit(input, 'echo hello');
    const log = screen.getByRole('log', { name: 'Terminal output' });
    await waitFor(() => expect(log.textContent).toContain('hello'));
    expect(input.value).toBe('');
  });

  it('prints errors from a failing command', async () => {
    const { input } = await mount();
    await submit(input, 'nosuch');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('command not found'));
  });

  it('reads the file system and follows cd', async () => {
    const { input } = await mount();
    await submit(input, 'cat Documents/notes.txt');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('alpha'));
    await submit(input, 'cd Documents');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('~/Documents'));
  });

  it('starts in the directory given by cwd', async () => {
    const { input } = await mount({ cwd: `${HOME}/Documents` });
    await submit(input, 'pwd');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain(`${HOME}/Documents`));
  });

  it('runs a launch script without echoing it', async () => {
    await mount({ script: 'echo from manifest' });
    const log = screen.getByRole('log');
    await waitFor(() => expect(log.textContent).toContain('from manifest'));
    expect(log.textContent).not.toContain('echo from manifest');
  });

  it('recalls history with ArrowUp and clears the line with Ctrl+U', async () => {
    const { input } = await mount();
    await submit(input, 'echo one');
    await waitFor(() => expect(screen.getByRole('log').textContent).toContain('one'));
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowUp}');
    expect(input.value).toBe('echo one');
    await userEvent.keyboard('{Control>}u{/Control}');
    expect(input.value).toBe('');
  });

  it('completes a path with Tab', async () => {
    const { input } = await mount();
    await userEvent.click(input);
    await userEvent.paste('cd Doc');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(input.value).toBe('cd Documents/'));
  });

  it('clears the screen with Ctrl+L', async () => {
    const { input } = await mount();
    await submit(input, 'echo visible');
    const log = screen.getByRole('log');
    await waitFor(() => expect(log.textContent).toContain('visible'));
    await userEvent.click(input);
    await userEvent.keyboard('{Control>}l{/Control}');
    await waitFor(() => expect(log.textContent).not.toContain('visible'));
  });

  it('writes history to the config file', async () => {
    const { kernel, input } = await mount();
    await submit(input, 'echo remembered');
    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<{ entries: string[] }>(
        `${HOME}/.config/terminal-history.json`,
      );
      expect(stored.entries).toContain('echo remembered');
    });
  });
});

describe('focus', () => {
  it('puts the caret on the prompt when the empty space is clicked', async () => {
    const { input } = await mount();
    input.blur();
    expect(document.activeElement).not.toBe(input);
    await userEvent.click(screen.getByRole('log', { name: 'Terminal output' }));
    expect(document.activeElement).toBe(input);
  });
});

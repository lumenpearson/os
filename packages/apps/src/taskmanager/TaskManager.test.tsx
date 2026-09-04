import {
  type AppDefinition,
  createKernel,
  type Kernel,
  type Pid,
  useProcessStore,
  useWindowStore,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../_sdk';
import definition from './index';
import TaskManager from './TaskManager';

const Dummy = () => null;

const editor: AppDefinition = {
  id: 'lumen.editor',
  name: 'Text Editor',
  description: 'Edit text',
  category: 'utilities',
  icon: Dummy,
  component: Dummy,
  window: { width: 600, height: 400 },
};

const notes: AppDefinition = {
  id: 'lumen.notes',
  name: 'Notes',
  description: 'Write notes',
  category: 'office',
  icon: Dummy,
  component: Dummy,
  window: { width: 500, height: 400 },
};

let kernel: Kernel;

function launch(appId: string): { pid: Pid; windowId: string } {
  const process = kernel.launch(appId);
  if (!process) throw new Error(`failed to launch ${appId}`);
  const windowId = process.windowIds[0];
  if (windowId === undefined) throw new Error(`${appId} opened no window`);
  return { pid: process.pid, windowId };
}

function mount() {
  const { pid, windowId } = launch('lumen.taskmanager');
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid, windowId, appId: 'lumen.taskmanager', container: null }}>
        <DialogProvider>
          <TaskManager pid={pid} windowId={windowId} args={{}} />
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, pid, windowId };
}

const grid = () => screen.getByRole('grid');
const rows = () => within(grid()).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('gridcell')
    .map((c) => c.textContent?.trim() ?? '');
const names = () => rows().map((r) => cells(r)[0] ?? '');
const rowFor = (name: string) => {
  const found = rows().find((r) => (cells(r)[0] ?? '').startsWith(name));
  if (!found) throw new Error(`no row for ${name}`);
  return found;
};
const header = (label: string) =>
  within(grid())
    .getAllByRole('columnheader')
    .find((h) => h.textContent?.trim().startsWith(label));

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }, editor, notes],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
});

afterEach(() => {
  cleanup();
  kernel.dispose();
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
  useProcessStore.setState({ processes: {} });
});

describe('TaskManager', () => {
  it('lists a row for every running process', async () => {
    launch('lumen.editor');
    launch('lumen.notes');
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(names()).toEqual(['Notes', 'Task Manager', 'Text Editor']);
  });

  it('shows the state of each process and the pid the kernel gave it', async () => {
    const { pid } = launch('lumen.editor');
    mount();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const row = cells(rowFor('Text Editor'));
    expect(row[1]).toBe(String(pid));
    // The monitor opened last, so it is the window with the focus.
    expect(row[2]).toBe('Running');
    expect(cells(rowFor('Task Manager'))[2]).toBe('Active');
  });

  it('prints an em-dash for memory and says why it cannot be measured', async () => {
    mount();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(cells(rowFor('Task Manager')).at(-1)).toBe('—');
    expect(screen.getByText(/cannot attribute heap to a single window/)).toBeInTheDocument();
  });

  it('sorts by a column when its header is clicked and says so in aria-sort', async () => {
    const user = userEvent.setup();
    launch('lumen.editor');
    launch('lumen.notes');
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');

    const pidHeader = header('PID');
    if (!pidHeader) throw new Error('no PID header');
    await user.click(pidHeader);
    await waitFor(() => expect(header('PID')).toHaveAttribute('aria-sort', 'ascending'));
    // Pids are handed out in launch order: editor, notes, then the monitor.
    expect(names()).toEqual(['Text Editor', 'Notes', 'Task Manager']);
    expect(header('Name')).toHaveAttribute('aria-sort', 'none');

    await user.click(pidHeader);
    await waitFor(() => expect(header('PID')).toHaveAttribute('aria-sort', 'descending'));
    expect(names()).toEqual(['Task Manager', 'Notes', 'Text Editor']);
  });

  it('focuses the first window of a process on double click', async () => {
    const user = userEvent.setup();
    const { windowId } = launch('lumen.editor');
    mount();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    useWindowStore.getState().minimize(windowId);
    await user.dblClick(rowFor('Text Editor'));
    await waitFor(() => {
      expect(useWindowStore.getState().focusedId).toBe(windowId);
      expect(useWindowStore.getState().windows[windowId]?.minimized).toBe(false);
    });
  });

  it('ends a selected process without asking when it has no unsaved work', async () => {
    const user = userEvent.setup();
    const { pid } = launch('lumen.editor');
    mount();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    await user.click(rowFor('Text Editor'));
    await user.click(screen.getByRole('button', { name: 'End Process' }));
    await waitFor(() => expect(useProcessStore.getState().processes[pid]).toBeUndefined());
    expect(names()).not.toContain('Text Editor');
  });

  it('asks before ending a process with unsaved work, and keeps it when refused', async () => {
    const user = userEvent.setup();
    const { pid, windowId } = launch('lumen.editor');
    useWindowStore.getState().setDirty(windowId, true);
    mount();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    await user.click(rowFor('Text Editor'));
    await user.click(screen.getByRole('button', { name: 'End Process' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/unsaved changes/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(useProcessStore.getState().processes[pid]).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'End Process' }));
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: 'End Process' }));
    await waitFor(() => expect(useProcessStore.getState().processes[pid]).toBeUndefined());
  });

  it('moves the selection with the arrow keys and ends it with Delete', async () => {
    const user = userEvent.setup();
    const { pid } = launch('lumen.editor');
    mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    // Rows sort by name: Task Manager, then Text Editor.
    grid().focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(rowFor('Task Manager')).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(rowFor('Text Editor')).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard('{Delete}');
    await waitFor(() => expect(useProcessStore.getState().processes[pid]).toBeUndefined());
  });

  it('keeps a row selected after the one before it ends', async () => {
    const user = userEvent.setup();
    const { pid } = launch('lumen.editor');
    launch('lumen.notes');
    mount();
    await waitFor(() => expect(rows()).toHaveLength(3));
    await user.click(rowFor('Text Editor'));
    await user.click(screen.getByRole('button', { name: 'End Process' }));
    await waitFor(() => expect(useProcessStore.getState().processes[pid]).toBeUndefined());
    // Text Editor sorted last, so the selection falls back to the row before.
    expect(rowFor('Task Manager')).toHaveAttribute('aria-selected', 'true');
  });

  it('leaves the buttons off until a process is selected', async () => {
    mount();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'End Process' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Focus Window' })).toBeDisabled();
  });

  it('switches to the app registry and can launch from it', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Apps' }));
    await waitFor(() => expect(screen.getByText(/apps registered/)).toBeInTheDocument());
    const row = rows().find((r) => (cells(r)[0] ?? '').startsWith('Text Editor'));
    if (!row) throw new Error('no Text Editor row');
    await user.click(within(row).getByRole('button', { name: 'Launch' }));
    await waitFor(() =>
      expect(useProcessStore.getState().findByApp('lumen.editor')).toHaveLength(1),
    );
  });

  it('names the source of every chart and explains the ones a browser cannot read', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('radio', { name: 'Performance' }));
    expect(await screen.findByText('Frame rate')).toBeInTheDocument();
    expect(screen.getByText('Host CPU')).toBeInTheDocument();
    expect(screen.getAllByText(/A browser cannot read host/).length).toBe(2);
    expect(screen.getByText('Animation frames delivered to this window')).toBeInTheDocument();
  });

  it('remembers the tab and the sampling rate for the next launch', async () => {
    const user = userEvent.setup();
    const view = mount();
    await user.click(screen.getByRole('radio', { name: 'Apps' }));
    await user.selectOptions(screen.getByRole('combobox'), '5000');
    const path = join(kernel.home, '.config', 'taskmanager.json');
    await waitFor(async () => {
      expect(await kernel.vfs.readJson<{ tab: string; refreshMs: number }>(path)).toMatchObject({
        tab: 'apps',
        refreshMs: 5000,
      });
    });
    view.unmount();

    mount();
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('5000'));
    expect(screen.getByRole('radio', { name: 'Apps' })).toHaveAttribute('aria-checked', 'true');
  });
});

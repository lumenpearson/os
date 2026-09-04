import { createKernel, type Kernel, useMenuStore, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Notes, { SAVE_DELAY } from './Notes';
import { notesDir } from './storage';

const Dummy = () => null;

let kernel: Kernel;
let dir: string;

const TASKS = [
  '---',
  'created: 2026-01-02T00:00:00.000Z',
  '---',
  '# Tasks',
  '',
  '- [ ] milk',
  '- [x] bread',
  '',
].join('\n');
const IDEAS = '# Ideas\n\nA thought about #work.\n';

function mount(args: Record<string, unknown> = {}) {
  const process = kernel.launch('lumen.notes', args);
  if (!process) throw new Error('failed to launch');
  const windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.notes', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Notes pid={process.pid} windowId={windowId} args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, windowId };
}

const area = () => screen.getByRole('textbox', { name: 'Note text' }) as HTMLTextAreaElement;
const list = () => screen.getByRole('listbox', { name: 'Notes' });
const rows = () => within(list()).getAllByRole('option');
const read = (name: string) => kernel.vfs.readText(join(dir, name));
const fileNames = async () => (await kernel.vfs.readDir(dir)).map((e) => e.name);

/** The menu item a command is offered under, as the menubar has it. */
function command(windowId: string, menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((i) => i.id === id);
  if (!item) throw new Error(`no ${menu} > ${id}`);
  return item;
}

const saved = { timeout: SAVE_DELAY * 5 };

beforeEach(async () => {
  const platform = createWebPlatform();
  // A clock that only moves forward gives the two fixtures distinct modified
  // times, so the order of the list is the same on every run.
  let clock = Date.now() - 60_000;
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter(() => (clock += 1_000)) },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  dir = notesDir(kernel.home);
  await kernel.vfs.writeText(join(dir, 'Ideas.md'), IDEAS, { recursive: true });
  await kernel.vfs.writeText(join(dir, 'Tasks.md'), TASKS, { recursive: true });
});

describe('opening', () => {
  it('lists the notes in the folder and opens one of them', async () => {
    const { windowId } = mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Tasks'),
      expect.stringContaining('Ideas'),
    ]);
    await waitFor(() => expect(area().value).toContain('# Tasks'));
    expect(area().value).not.toContain('---');
    expect(useWindowStore.getState().windows[windowId]?.title).toBe('Tasks');
  });

  it('opens the note it was launched with', async () => {
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    expect(useWindowStore.getState().windows[windowId]?.documentPath).toBe(join(dir, 'Ideas.md'));
  });

  it('counts the notes and shows the tags found in them', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('2 notes')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /work/ })).toBeInTheDocument();
  });
});

describe('editing', () => {
  it('writes the note back after a pause and says so', async () => {
    mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));

    fireEvent.change(area(), { target: { value: '# Ideas\n\nA better thought.\n' } });
    expect(screen.getByText('Unsaved')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), saved);
    expect(await read('Ideas.md')).toBe('# Ideas\n\nA better thought.\n');
  });

  it('marks the window dirty until the note is on disk', async () => {
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    fireEvent.change(area(), { target: { value: 'changed' } });
    await waitFor(() => expect(useWindowStore.getState().windows[windowId]?.dirty).toBe(true));
    await waitFor(
      () => expect(useWindowStore.getState().windows[windowId]?.dirty).toBe(false),
      saved,
    );
  });

  it('writes the note the moment the editor loses focus', async () => {
    mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    fireEvent.change(area(), { target: { value: 'quick edit' } });
    fireEvent.blur(area());
    await waitFor(() => expect(read('Ideas.md')).resolves.toBe('quick edit'));
  });

  it('keeps the front matter when only the body is edited', async () => {
    mount({ path: join(dir, 'Tasks.md') });
    await waitFor(() => expect(area().value).toContain('# Tasks'));
    fireEvent.change(area(), { target: { value: '# Tasks\n\n- [ ] milk\n- [ ] eggs\n' } });
    fireEvent.blur(area());
    await waitFor(async () =>
      expect(await read('Tasks.md')).toBe(
        '---\ncreated: 2026-01-02T00:00:00.000Z\n---\n# Tasks\n\n- [ ] milk\n- [ ] eggs\n',
      ),
    );
  });

  it('retitles the window as the first heading changes', async () => {
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    fireEvent.change(area(), { target: { value: '# Better ideas\n' } });
    await waitFor(() =>
      expect(useWindowStore.getState().windows[windowId]?.title).toBe('Better ideas'),
    );
  });
});

describe('the preview', () => {
  it('ticks a task off and rewrites that line of the file', async () => {
    const user = userEvent.setup();
    mount({ path: join(dir, 'Tasks.md') });
    await waitFor(() => expect(area().value).toContain('- [ ] milk'));

    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([false, true]);

    await user.click(boxes[0] as HTMLElement);
    await waitFor(async () => expect(await read('Tasks.md')).toContain('- [x] milk\n- [x] bread'));
    expect(await read('Tasks.md')).toContain('created: 2026-01-02T00:00:00.000Z');
  });

  it('shows the source and the rendering side by side in split view', async () => {
    const user = userEvent.setup();
    mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    await user.click(screen.getByRole('radio', { name: 'Split' }));
    expect(area()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ideas' })).toBeInTheDocument();
  });
});

describe('the File menu', () => {
  it('renames the note and the file under it', async () => {
    const user = userEvent.setup();
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));

    await act(async () => command(windowId, 'file', 'rename').onSelect?.());
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'Bright ideas');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    await waitFor(async () => expect(await fileNames()).toContain('Bright ideas.md'));
    expect(await fileNames()).not.toContain('Ideas.md');
    expect(await read('Bright ideas.md')).toContain('# Bright ideas');
  });

  it('pins a note to the top of the list', async () => {
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    expect(command(windowId, 'file', 'pin').checked).toBe(false);

    await act(async () => command(windowId, 'file', 'pin').onSelect?.());
    await waitFor(async () => expect(await read('Ideas.md')).toContain('pinned: true'), saved);
    await waitFor(() => expect(rows()[0]?.textContent).toContain('Ideas'));
    expect(command(windowId, 'file', 'pin').checked).toBe(true);
  });

  it('moves a note to the trash once it is confirmed', async () => {
    const user = userEvent.setup();
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));

    await act(async () => command(windowId, 'file', 'trash').onSelect?.());
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));

    await waitFor(async () => expect(await fileNames()).toEqual(['Tasks.md']));
    await waitFor(() => expect(rows()).toHaveLength(1));
    await waitFor(() => expect(area().value).toContain('# Tasks'));
  });

  it('duplicates a note beside the original', async () => {
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    await act(async () => command(windowId, 'file', 'duplicate').onSelect?.());
    await waitFor(async () => expect(await fileNames()).toContain('Ideas 2.md'));
    await waitFor(() => expect(area().value).toContain('# Ideas 2'));
  });
});

describe('the View menu', () => {
  it('folds the tag rail away and brings it back', async () => {
    const { windowId } = mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByRole('button', { name: /work/ })).toBeInTheDocument();

    await act(async () => command(windowId, 'view', 'show-tags').onSelect?.());
    await waitFor(() => expect(screen.queryByRole('button', { name: /work/ })).toBeNull());

    await act(async () => command(windowId, 'view', 'show-tags').onSelect?.());
    await waitFor(() => expect(screen.getByRole('button', { name: /work/ })).toBeInTheDocument());
  });

  it('switches the pane the note is shown in', async () => {
    const { windowId } = mount({ path: join(dir, 'Ideas.md') });
    await waitFor(() => expect(area().value).toBe(IDEAS));
    await act(async () => command(windowId, 'view', 'view-preview').onSelect?.());
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Note text' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Ideas' })).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('makes a new note and opens it', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(await read('Untitled.md')).toContain('# Untitled');
    await waitFor(() => expect(area().value).toContain('# Untitled'));
  });

  it('filters as you search and counts the matches', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'thought');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.textContent).toContain('Ideas');
    expect(screen.getByText('1 in 1')).toBeInTheDocument();
  });

  it('says so when a search finds nothing', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'zzz');
    await waitFor(() => expect(screen.getByText('No matches')).toBeInTheDocument());
  });

  it('narrows to one tag from the rail', async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: /work/ }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]?.textContent).toContain('Ideas');
  });

  it('moves the selection with the arrow keys', async () => {
    mount();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await waitFor(() => expect(rows()[0]).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    await waitFor(() => expect(rows()[1]).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(area().value).toBe(IDEAS));
    fireEvent.keyDown(list(), { key: 'ArrowUp' });
    await waitFor(() => expect(area().value).toContain('# Tasks'));
  });
});

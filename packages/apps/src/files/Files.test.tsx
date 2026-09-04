import {
  type AppDefinition,
  createKernel,
  type Kernel,
  useClipboardStore,
  useMenuStore,
  useSettingsStore,
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
import Files from './Files';
import definition from './index';

const Dummy = () => null;
const editor: AppDefinition = {
  id: 'lumen.editor',
  name: 'Text Editor',
  description: 'Edit text',
  category: 'utilities',
  icon: Dummy,
  component: Dummy,
  window: { width: 600, height: 400 },
  fileAssociations: [{ extensions: ['.txt', '.md'], role: 'editor' }],
};

let kernel: Kernel;
let home: string;
/** Fixtures live in their own folder so counts and names stay predictable. */
let cases: string;

function mount(path: string) {
  const process = kernel.launch('lumen.files', { path });
  if (!process) throw new Error('failed to launch');
  const windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.files', container: null }}>
        <DialogProvider>
          <Files pid={process.pid} windowId={windowId} args={{ path }} />
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, windowId, pid: process.pid };
}

/** The file area, so sidebar and breadcrumb labels never collide with item names. */
const area = () => screen.getByRole('grid');
const item = (name: string) => within(area()).getByText(name);
const findItem = (name: string) => within(area()).findByText(name);
const missing = (name: string) => within(area()).queryByText(name);
const names = () =>
  within(area())
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('[role="gridcell"]')?.textContent?.trim() ?? '');

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }, editor],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  cases = join(home, 'Cases');
  useSettingsStore
    .getState()
    .patch('files', { home, confirmDelete: false, showHidden: false, defaultView: 'list' });
  await kernel.vfs.ensureDir(join(cases, 'Work'));
  await kernel.vfs.writeText(join(cases, 'notes.md'), '# notes\n');
  await kernel.vfs.writeText(join(cases, 'todo.txt'), 'one\ntwo\n');
  await kernel.vfs.writeText(join(cases, '.hidden'), 'x');
  useClipboardStore.getState().clear();
});

afterEach(() => {
  cleanup();
  kernel.dispose();
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
});

describe('Files', () => {
  it('lists the launch folder, hides dotfiles and counts items', async () => {
    mount(cases);
    expect(await findItem('notes.md')).toBeInTheDocument();
    expect(item('Work')).toBeInTheDocument();
    expect(missing('.hidden')).not.toBeInTheDocument();
    expect(screen.getByText(/^3 items/)).toBeInTheDocument();
  });

  it('shows folders first, with a dash for their size', async () => {
    mount(cases);
    await findItem('notes.md');
    expect(names()).toEqual(['Work', 'notes.md', 'todo.txt']);
    expect(within(area()).getAllByText('—')).toHaveLength(1);
  });

  it('titles the window after the folder and tracks the document path', async () => {
    const { windowId } = mount(cases);
    await waitFor(() => {
      const win = useWindowStore.getState().windows[windowId];
      expect(win?.title).toBe('Cases');
      expect(win?.documentPath).toBe(cases);
    });
  });

  it('opens a folder on double click and walks history back and forward', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.dblClick(await findItem('Work'));
    await waitFor(() => expect(missing('notes.md')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await findItem('notes.md')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    await waitFor(() => expect(missing('notes.md')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Enclosing folder' }));
    expect(await findItem('notes.md')).toBeInTheDocument();
  });

  it('navigates from the sidebar', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Sidebar' })).getByRole('button', {
        name: 'Documents',
      }),
    );
    await waitFor(() => expect(missing('notes.md')).not.toBeInTheDocument());
    const sidebar = within(screen.getByRole('navigation', { name: 'Sidebar' }));
    await user.click(sidebar.getByRole('button', { name: 'Home' }));
    expect(await findItem('Cases')).toBeInTheDocument();
  });

  it('selects with click and Ctrl+A, and reports the count', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.click(await findItem('notes.md'));
    expect(await screen.findByText(/1 selected/)).toBeInTheDocument();
    await user.keyboard('{Control>}a{/Control}');
    expect(await screen.findByText(/3 selected/)).toBeInTheDocument();
  });

  it('creates a folder and renames it inline', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.click(screen.getByRole('button', { name: 'New folder' }));

    const input = await screen.findByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'Reports{Enter}');

    expect(await findItem('Reports')).toBeInTheDocument();
    expect(await kernel.vfs.exists(join(cases, 'Reports'))).toBe(true);
  });

  it('refuses a rename that collides with a sibling', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.click(await findItem('todo.txt'));
    await user.keyboard('{F2}');

    const input = await screen.findByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'notes.md');
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has this name/i);

    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'New name' })).toBeInTheDocument();
    expect(await kernel.vfs.exists(join(cases, 'todo.txt'))).toBe(true);
  });

  it('moves a file to the Trash with the Delete key and offers Put Back there', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.click(await findItem('todo.txt'));
    await user.keyboard('{Delete}');

    await waitFor(() => expect(missing('todo.txt')).not.toBeInTheDocument());
    expect(await kernel.vfs.exists('/Trash/todo.txt')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Trash' }));
    await user.click(await findItem('todo.txt'));
    await user.pointer({ target: item('todo.txt'), keys: '[MouseRight]' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Put Back')).toBeInTheDocument();
    expect(within(menu).getByText('Delete Permanently')).toBeInTheDocument();
  });

  it('copies and pastes through the clipboard', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.click(await findItem('notes.md'));
    await user.keyboard('{Control>}c{/Control}');
    expect(useClipboardStore.getState().item?.files?.paths).toEqual([join(cases, 'notes.md')]);

    await user.dblClick(item('Work'));
    await waitFor(() => expect(missing('notes.md')).not.toBeInTheDocument());
    await user.keyboard('{Control>}v{/Control}');
    expect(await findItem('notes.md')).toBeInTheDocument();
    expect(await kernel.vfs.exists(join(cases, 'Work', 'notes.md'))).toBe(true);
    expect(await kernel.vfs.exists(join(cases, 'notes.md'))).toBe(true);
  });

  it('cuts and pastes, clearing the clipboard afterwards', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.click(await findItem('notes.md'));
    await user.keyboard('{Control>}x{/Control}');
    await user.dblClick(item('Work'));
    await waitFor(() => expect(missing('notes.md')).not.toBeInTheDocument());
    await user.keyboard('{Control>}v{/Control}');

    expect(await findItem('notes.md')).toBeInTheDocument();
    await waitFor(() => expect(useClipboardStore.getState().item).toBeNull());
    expect(await kernel.vfs.exists(join(cases, 'notes.md'))).toBe(false);
  });

  it('searches the folder recursively and shows the parent path', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeText(join(cases, 'Work', 'deep-notes.md'), 'x');
    mount(cases);
    await findItem('notes.md');
    await user.type(screen.getByRole('searchbox'), 'notes');

    const results = await screen.findByRole('listbox', { name: /results for notes/i });
    await waitFor(() => expect(within(results).getByText('deep-notes.md')).toBeInTheDocument());
    expect(within(results).getByText(join(cases, 'Work'))).toBeInTheDocument();
  });

  it('switches to grid and to columns, opening a child column', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');

    await user.click(screen.getByRole('radio', { name: 'Grid' }));
    const grid = await screen.findByRole('listbox', { name: 'Files' });
    expect(within(grid).getByText('notes.md')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Columns' }));
    const first = await screen.findByRole('listbox', { name: cases });
    await user.click(within(first).getByText('Work'));
    expect(await screen.findByRole('listbox', { name: join(cases, 'Work') })).toBeInTheDocument();
  });

  it('sorts by name in both directions from the column header', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.click(within(area()).getByRole('columnheader', { name: /Name/ }));
    await waitFor(() => expect(names()).toEqual(['Work', 'todo.txt', 'notes.md']));
    await user.click(within(area()).getByRole('columnheader', { name: /Name/ }));
    await waitFor(() => expect(names()).toEqual(['Work', 'notes.md', 'todo.txt']));
  });

  it('opens Get Info from the context menu', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.pointer({ target: await findItem('notes.md'), keys: '[MouseRight]' });
    await user.click(within(await screen.findByRole('menu')).getByText('Get Info'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Markdown')).toBeInTheDocument();
    expect(within(dialog).getByText(cases)).toBeInTheDocument();
  });

  it('shows an error state for a missing folder with a way home', async () => {
    const user = userEvent.setup();
    mount(join(home, 'Nowhere'));
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Go Home/ }));
    expect(await findItem('Cases')).toBeInTheDocument();
  });

  it('toggles hidden files from the empty-space context menu', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.pointer({ target: area(), keys: '[MouseRight]' });
    await user.click(within(await screen.findByRole('menu')).getByText('Show Hidden Files'));

    expect(await findItem('.hidden')).toBeInTheDocument();
    expect(useSettingsStore.getState().settings.files.showHidden).toBe(true);
  });

  it('sorts from the toolbar menu', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.click(screen.getByRole('button', { name: 'Sort' }));

    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByText('Descending'));
    await waitFor(() => expect(names()).toEqual(['Work', 'todo.txt', 'notes.md']));
  });

  it('previews a text file in Quick Look with the space bar', async () => {
    const user = userEvent.setup();
    mount(cases);
    await user.click(await findItem('todo.txt'));
    await user.keyboard(' ');

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText(/one/)).toBeInTheDocument());
    expect(within(dialog).getByText('Plain Text')).toBeInTheDocument();
  });

  it('jumps to a typed path from Go to Folder', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.keyboard('{Shift>}{Control>}g{/Control}{/Shift}');

    const input = await screen.findByRole('textbox');
    await user.clear(input);
    await user.type(input, '~/Cases/Work{Enter}');
    await waitFor(() => expect(missing('notes.md')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument();
  });

  it('contributes its menubar menus while focused', async () => {
    const { windowId } = mount(cases);
    await findItem('notes.md');
    await waitFor(() => {
      expect(useMenuStore.getState().byWindow[windowId]?.map((m) => m.label)).toEqual([
        'File',
        'Edit',
        'View',
        'Go',
      ]);
    });
  });
});

describe('definition', () => {
  it('matches the app contract', () => {
    expect(definition.id).toBe('lumen.files');
    expect(definition.name).toBe('Files');
    expect(definition.category).toBe('system');
    expect(definition.window.titleBar).toBe('inset');
    expect(definition.acceptsDirectories).toBe(true);
    expect(definition.pinnedByDefault).toBe(true);
  });
});

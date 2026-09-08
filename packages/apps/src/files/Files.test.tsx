import {
  type AppDefinition,
  createKernel,
  type Kernel,
  useClipboardStore,
  useMenuStore,
  useProcessStore,
  useSettingsStore,
  useWindowStore,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider, type MenuEntry } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../_sdk';
import Files from './Files';
import definition from './index';
import type { FilesPrefs } from './settings';

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
  // The file manager runs for the whole session, so a launch adds a window to
  // the process it already has: the newest one is this render's window.
  const windowId = process.windowIds[process.windowIds.length - 1] as string;
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

/** The preferences this window writes under the home directory. */
const storedPrefs = () => kernel.vfs.readJson<FilesPrefs>(join(home, '.config', 'files.json'));

/**
 * Runs a command from the window's own menubar, by id: `['view', 'toolbar',
 * 'toolbar-search']` is View → Toolbar → Search.
 */
async function runMenu(windowId: string, path: readonly string[]) {
  const menus = useMenuStore.getState().byWindow[windowId] ?? [];
  const [head, ...rest] = path;
  let items: MenuEntry[] = menus.find((m) => m.id === head)?.items ?? [];
  let item: MenuEntry | undefined;
  for (const id of rest) {
    item = items.find((i) => i.id === id);
    items = item?.submenu ?? [];
  }
  if (!item?.onSelect) throw new Error(`no menu command at ${path.join(' > ')}`);
  const select = item.onSelect;
  await act(async () => {
    select();
  });
}

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
  // The stores are module state; the session-long file manager process would
  // otherwise survive into the next test and hand it a dead window id.
  useProcessStore.setState({ processes: {}, nextPid: 100 });
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

  it('shows a card lane, walks it with the arrow keys and turns it upright', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(cases);
    await findItem('notes.md');

    await user.click(screen.getByRole('radio', { name: 'Cards' }));
    const lane = await screen.findByRole('listbox', { name: 'Files' });
    expect(lane).toHaveAttribute('aria-orientation', 'horizontal');
    expect(within(lane).getByText('todo.txt')).toBeInTheDocument();

    await user.click(within(lane).getByText('Work'));
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      const on = within(lane)
        .getAllByRole('option')
        .filter((o) => o.getAttribute('aria-selected') === 'true');
      expect(on.map((o) => o.dataset.path)).toEqual([join(cases, 'notes.md')]);
    });

    await runMenu(windowId, ['view', 'card-axis', 'card-axis-vertical']);
    expect(await screen.findByRole('listbox', { name: 'Files' })).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    await waitFor(async () => expect((await storedPrefs()).cardAxis).toBe('vertical'));
  });

  it('scrolls the card lane with the wheel instead of the page', async () => {
    const user = userEvent.setup();
    mount(cases);
    await findItem('notes.md');
    await user.click(screen.getByRole('radio', { name: 'Cards' }));
    const lane = await screen.findByRole('listbox', { name: 'Files' });

    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    lane.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    await waitFor(() => expect(lane.scrollLeft).toBe(120));
  });

  it('remembers the view and the icon size for the next window', async () => {
    const user = userEvent.setup();
    const first = mount(cases);
    await findItem('notes.md');
    await user.click(screen.getByRole('radio', { name: 'Cards' }));
    await runMenu(first.windowId, ['view', 'icon-size', 'icon-size-large']);
    await waitFor(async () => {
      const saved = await storedPrefs();
      expect(saved.view).toBe('cards');
      expect(saved.iconSize).toBe('large');
    });

    cleanup();
    mount(cases);
    const lane = await screen.findByRole('listbox', { name: 'Files' });
    expect(within(lane).getByText('notes.md')).toBeInTheDocument();
  });

  it('filters by kind, counts what it hid, and clears it from the toolbar', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(cases);
    await findItem('notes.md');

    await runMenu(windowId, ['view', 'filter', 'filter-kind', 'filter-kind-folders']);
    await waitFor(() => expect(names()).toEqual(['Work']));
    expect(screen.getByText(/^1 of 3 items/)).toBeInTheDocument();
    expect(screen.getByText('Filter: Folders')).toBeInTheDocument();
    await waitFor(async () => expect((await storedPrefs()).filter.kind).toBe('folders'));

    await user.click(screen.getByRole('button', { name: 'Filter: Folders' }));
    await user.click(within(await screen.findByRole('menu')).getByText('Clear Filters'));
    await waitFor(() => expect(names()).toEqual(['Work', 'notes.md', 'todo.txt']));
  });

  it('says so when a filter leaves the folder empty, and offers a way out', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(cases);
    await findItem('notes.md');

    await runMenu(windowId, ['view', 'filter', 'filter-kind', 'filter-kind-audio']);
    expect(await screen.findByText('Nothing here matches the filter')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(await findItem('notes.md')).toBeInTheDocument();
  });

  it('narrows a search with a name pattern', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeText(join(cases, 'Work', 'deep-notes.md'), 'x');
    const { windowId } = mount(cases);
    await findItem('notes.md');
    await user.type(screen.getByRole('searchbox'), 'notes');
    const results = await screen.findByRole('listbox', { name: /results for notes/i });
    await waitFor(() => expect(within(results).getByText('deep-notes.md')).toBeInTheDocument());

    await runMenu(windowId, ['view', 'filter', 'filter-pattern']);
    const input = await screen.findByRole('textbox');
    await user.clear(input);
    await user.type(input, 'deep*{Enter}');

    await waitFor(() => expect(within(results).queryByText('notes.md')).not.toBeInTheDocument());
    expect(within(results).getByText('deep-notes.md')).toBeInTheDocument();
  });

  it('sorts folders in with the files when Folders First is off', async () => {
    const { windowId } = mount(cases);
    await findItem('notes.md');
    expect(names()).toEqual(['Work', 'notes.md', 'todo.txt']);

    await runMenu(windowId, ['view', 'sort-by', 'sort-folders-first']);
    await waitFor(() => expect(names()).toEqual(['notes.md', 'todo.txt', 'Work']));
    expect(useSettingsStore.getState().settings.files.foldersFirst).toBe(false);
  });

  it('takes a control out of the toolbar and remembers it', async () => {
    const { windowId } = mount(cases);
    await findItem('notes.md');
    expect(screen.getByRole('searchbox')).toBeInTheDocument();

    await runMenu(windowId, ['view', 'toolbar', 'toolbar-search']);
    await waitFor(() => expect(screen.queryByRole('searchbox')).not.toBeInTheDocument());
    await waitFor(async () => expect((await storedPrefs()).toolbar.search).toBe(false));
  });

  it('shows the A–Z rail and jumps to a letter', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(cases);
    await findItem('notes.md');
    expect(screen.queryByRole('navigation', { name: 'Jump to letter' })).not.toBeInTheDocument();

    await runMenu(windowId, ['view', 'index-rail']);
    const rail = await screen.findByRole('navigation', { name: 'Jump to letter' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['N', 'T', 'W']);

    await user.click(within(rail).getByRole('button', { name: 'W' }));
    expect(await screen.findByText(/1 selected/)).toBeInTheDocument();
  });

  it('hides the sidebar from the View menu and keeps it hidden', async () => {
    const { windowId } = mount(cases);
    await findItem('notes.md');
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();

    await runMenu(windowId, ['view', 'sidebar']);
    await waitFor(async () => expect((await storedPrefs()).sidebar).toBe(false));
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

import { createKernel, type Kernel, useClipboardStore, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import { normalizeData, type WorkbenchData } from './storage';
import Workbench from './Workbench';

let kernel: Kernel;
let home: string;
let windowId: string;

/** Let the pending VFS reads and the state updates they cause land. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mount() {
  const process = kernel.launch('lumen.workbench', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider
        value={{ pid: process.pid, windowId, appId: 'lumen.workbench', container: null }}
      >
        <DialogProvider>
          <FileDialogProvider>
            <Workbench pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

/** A menu item this window contributed. */
function command(menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((i) => i.id === id);
  if (!item) throw new Error(`no ${menu} > ${id}`);
  return item;
}

async function choose(menu: string, id: string) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
}

const settingsPath = () => join(home, '.config', 'workbench.json');

const stored = async (): Promise<WorkbenchData> =>
  normalizeData(await kernel.vfs.readJson(settingsPath()));

const field = (label: string) => screen.getByLabelText(label) as HTMLTextAreaElement;

const Dummy = () => null;

/**
 * happy-dom gives every element a zero size and its ResizeObserver never
 * fires, so the window would always measure as too narrow for the sidebar.
 * This one reports a real window's box on the first observation, as a browser
 * does.
 */
let observedWidth = 960;

class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const entry = {
      target,
      contentRect: {
        width: observedWidth,
        height: 680,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: observedWidth,
        bottom: 680,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = originalObserver;
});

beforeEach(async () => {
  observedWidth = 960;
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  useClipboardStore.getState().clear();
});

describe('the app definition', () => {
  it('is the app the shell expects', () => {
    expect(definition.id).toBe('lumen.workbench');
    expect(definition.name).toBe('Workbench');
    expect(definition.category).toBe('developer');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 960,
      height: 680,
      minWidth: 400,
      minHeight: 320,
      titleBar: 'inset',
    });
    expect(definition.keywords).toContain('base64');
  });
});

describe('Workbench', () => {
  it('opens on the JSON tool with its pane and sidebar', async () => {
    await mount();
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();
    expect(field('Document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regex' })).toBeInTheDocument();
  });

  it('formats a document as it is typed', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(field('Document'), '{{"a":1}');
    await waitFor(() => expect(field('Formatted').value).toBe('{\n  "a": 1\n}'));
  });

  it('shows a parse error with a line and a column next to the field', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(field('Document'), '{{,}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "Line 1, column 2: Expected a property name in double quotes, found ','",
    );
    expect(field('Formatted').value).toBe('');
  });

  it('switches tools from the sidebar and keeps each pane its own state', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(field('Document'), '[[1]');
    await user.click(screen.getByRole('button', { name: 'Diff' }));
    expect(screen.getByLabelText('Original')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(field('Document').value).toBe('[1]');
  });

  it('switches tools from the View menu and from Next Tool', async () => {
    await mount();
    const digestField = () => screen.findByRole('textbox', { name: 'SHA-256' });
    await choose('view', 'tool-hash');
    expect(await digestField()).toBeInTheDocument();
    await choose('view', 'next-tool');
    expect(await screen.findByLabelText('Document')).toBeInTheDocument();
    await choose('view', 'previous-tool');
    expect(await digestField()).toBeInTheDocument();
  });

  it('remembers the tool and the fields across a restart', async () => {
    const user = userEvent.setup();
    const first = await mount();
    await user.click(screen.getByRole('button', { name: 'Encode' }));
    await user.type(screen.getByLabelText('Text'), 'hello');
    await waitFor(async () => {
      const data = await stored();
      expect(data.tool).toBe('encode');
      expect(data.encode.input).toBe('hello');
    });

    first.unmount();
    await mount();
    expect(await screen.findByLabelText('Text')).toHaveValue('hello');
    expect(screen.getByLabelText('Base64')).toHaveValue('aGVsbG8=');
  });

  it('copies the pane output through the Copy Output command', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(field('Document'), '{{"a":1}');
    await waitFor(() => expect(command('edit', 'copy-output').enabled).not.toBe(false));
    await choose('edit', 'copy-output');
    expect(useClipboardStore.getState().item?.text).toBe('{\n  "a": 1\n}');
  });

  it('disables Copy Output while the pane has produced nothing', async () => {
    await mount();
    expect(command('edit', 'copy-output').enabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Copy Output' })).toBeDisabled();
  });

  it('clears the fields of the current tool but keeps its options', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Encode' }));
    await user.selectOptions(screen.getByLabelText('Format'), 'hex');
    await user.type(screen.getByLabelText('Text'), 'abc');
    await waitFor(() => expect(screen.getByLabelText('Hex')).toHaveValue('616263'));

    await choose('edit', 'clear');
    await waitFor(() => expect(screen.getByLabelText('Text')).toHaveValue(''));
    expect(screen.getByLabelText('Format')).toHaveValue('hex');
  });

  it('leaves the other tools alone when one is cleared', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(field('Document'), '[[1]');
    await user.click(screen.getByRole('button', { name: 'Diff' }));
    await user.type(screen.getByLabelText('Original'), 'x');
    await choose('edit', 'clear');
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(field('Document')).toHaveValue('[1]');
  });

  it('lists regex matches with their groups', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Regex' }));
    await user.type(screen.getByLabelText('Pattern'), '(?<k>\\w+)=(\\d+)');
    await user.type(screen.getByLabelText('Subject'), 'a=1 bb=22');
    const list = await screen.findByRole('list', { name: 'Matches' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(list).toHaveTextContent('a=1');
    expect(list).toHaveTextContent('bb=22');
    expect(list).toHaveTextContent('k=bb');
  });

  it('says what is wrong with a pattern instead of throwing', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Regex' }));
    await user.type(screen.getByLabelText('Pattern'), '(');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('generates the number of identifiers asked for', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'IDs' }));
    const list = await screen.findByRole('list', { name: 'Generated UUID v4' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    const before = within(list).getAllByRole('listitem')[0]?.textContent;
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Generated UUID v4' })).getAllByRole('listitem')[0]
          ?.textContent,
      ).not.toBe(before),
    );
  });

  it('converts a timestamp and offers each value to copy', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Time' }));
    await user.selectOptions(screen.getByLabelText('Zone'), 'America/New_York');
    await user.type(screen.getByLabelText('Timestamp or date'), '1700000000');
    await waitFor(() => expect(screen.getByTitle('2023-11-14T17:13:20-05:00')).toBeInTheDocument());
    expect(screen.getByTitle('2023-11-14T22:13:20Z')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy epoch seconds' }));
    expect(useClipboardStore.getState().item?.text).toBe('1700000000');
  });

  it('compares two texts and marks the changed lines', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Diff' }));
    await user.type(screen.getByLabelText('Original'), 'a{enter}b');
    await user.type(screen.getByLabelText('Changed'), 'a{enter}c');
    await waitFor(() => expect(screen.getByText('+1 −1')).toBeInTheDocument());
    await choose('edit', 'copy-output');
    expect(useClipboardStore.getState().item?.text).toBe('  a\n- b\n+ c');
  });

  it('folds the sidebar into a select on a narrow window', async () => {
    const user = userEvent.setup();
    observedWidth = 420;
    await mount();
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument();
    const picker = screen.getByLabelText('Tool');
    await user.selectOptions(picker, 'diff');
    expect(await screen.findByLabelText('Original')).toBeInTheDocument();
  });

  it('drops the words from the toolbar buttons on a narrow window but keeps their names', async () => {
    observedWidth = 420;
    await mount();
    const copy = screen.getByRole('button', { name: 'Copy Output' });
    expect(copy).toBeInTheDocument();
    expect(copy).toHaveTextContent('');
  });

  it('puts a bad path next to the path field, not next to the document', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(field('Document'), '{{"a":1}');
    await user.type(screen.getByLabelText('Path'), '$[[');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Column 2: Expected ']'");
    expect(screen.getByLabelText('Path')).toHaveAttribute('aria-describedby', alert.id);
    expect(screen.getByLabelText('Path')).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps every command reachable from the menubar', async () => {
    await mount();
    const menus = useMenuStore.getState().byWindow[windowId] ?? [];
    expect(menus.map((m) => m.id)).toEqual(['file', 'edit', 'view']);
    expect(command('file', 'close').shortcut).toBe('Mod+W');
    expect(command('edit', 'copy-output').shortcut).toBe('Shift+Mod+C');
    expect(command('view', 'tool-json').shortcut).toBe('Mod+1');
  });
});

describe('the row the window is dragged by', () => {
  it('keeps the window controls clear and names the tool in view', async () => {
    await mount();
    const toolbar = screen.getByRole('toolbar');
    // The title bar is inset, so the controls are drawn over this row.
    expect(toolbar.className).toContain('ps-(--lumen-window-controls-w)');
    // What the title used to say is now the tool the window is on.
    expect(within(toolbar).getByText('JSON')).toBeInTheDocument();
  });

  it('names the tool through the select when the sidebar has folded away', async () => {
    observedWidth = 420;
    await mount();
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.className).toContain('ps-(--lumen-window-controls-w)');
    expect(within(toolbar).getByRole('combobox', { name: 'Tool' })).toHaveValue('json');
  });
});

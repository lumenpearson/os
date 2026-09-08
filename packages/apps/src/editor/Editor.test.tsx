import { createKernel, type Kernel, useMenuStore, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Editor from './Editor';
import { LARGE_FILE_LIMIT } from './editing';
import definition from './index';

const Dummy = () => null;

let kernel: Kernel;
let home: string;

function mount(path: string | null) {
  const args = path ? { path } : {};
  const process = kernel.launch('lumen.editor', args);
  if (!process) throw new Error('failed to launch');
  const windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.editor', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Editor pid={process.pid} windowId={windowId} args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, windowId, pid: process.pid };
}

const area = () => screen.getByRole('textbox', { name: 'Document text' }) as HTMLTextAreaElement;

function command(windowId: string, menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((i) => i.id === id);
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
  await kernel.vfs.writeText(join(home, 'notes.txt'), 'alpha\nbeta\nalpha\n');
});

afterEach(cleanup);

describe('opening a document', () => {
  it('shows the file, its name and its type', async () => {
    const { windowId } = mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    expect(useWindowStore.getState().windows[windowId]?.title).toBe('notes.txt');
    expect(screen.getByText('Plain Text')).toBeInTheDocument();
    expect(screen.getByText('Ln 1, Col 1')).toBeInTheDocument();
    expect(screen.getByText('3 words')).toBeInTheDocument();
  });

  it('starts empty with no path', async () => {
    const { windowId } = mount(null);
    await waitFor(() => expect(area()).toHaveValue(''));
    expect(useWindowStore.getState().windows[windowId]?.title).toBe('Untitled');
  });

  it('numbers the lines', async () => {
    mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    expect(screen.getByText('4', { selector: 'span' })).toBeInTheDocument();
  });

  it('contributes the four menus', async () => {
    const { windowId } = mount(null);
    await waitFor(() =>
      expect(useMenuStore.getState().byWindow[windowId]?.map((m) => m.label)).toEqual([
        'File',
        'Edit',
        'View',
        'Help',
      ]),
    );
  });
});

describe('editing', () => {
  it('marks the window dirty while typing', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    await user.click(area());
    await user.keyboard('x');
    await waitFor(() => expect(useWindowStore.getState().windows[windowId]?.dirty).toBe(true));
  });

  it('inserts two spaces for Tab', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(area());
    await user.keyboard('a{Tab}b');
    expect(area()).toHaveValue('a  b');
  });

  it('repeats the indentation on Enter', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.click(area());
    await user.keyboard('{Tab}one{Enter}two');
    expect(area()).toHaveValue('  one\n  two');
  });

  it('undoes a typing burst and redoes it', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(null);
    await user.click(area());
    await user.keyboard('hello');
    command(windowId, 'edit', 'undo').onSelect?.();
    await waitFor(() => expect(area()).toHaveValue(''));
    command(windowId, 'edit', 'redo').onSelect?.();
    await waitFor(() => expect(area()).toHaveValue('hello'));
  });

  it('reads the caret position and the selection length', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    await user.click(area());
    command(windowId, 'edit', 'select-all').onSelect?.();
    await waitFor(() => expect(screen.getByText('17 selected')).toBeInTheDocument());
    expect(screen.getByText('Ln 4, Col 1')).toBeInTheDocument();
  });
});

describe('saving', () => {
  it('writes the file back', async () => {
    const user = userEvent.setup();
    const path = join(home, 'notes.txt');
    const { windowId } = mount(path);
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    await user.click(area());
    await user.keyboard('!');
    command(windowId, 'file', 'save').onSelect?.();
    await waitFor(async () => expect(await kernel.vfs.readText(path)).toContain('!'));
    await waitFor(() => expect(useWindowStore.getState().windows[windowId]?.dirty).toBe(false));
  });
});

describe('find and replace', () => {
  it('counts matches and replaces them', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));

    command(windowId, 'edit', 'replace').onSelect?.();
    const query = await screen.findByRole('textbox', { name: 'Find' });
    await user.type(query, 'alpha');
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Next match' }));
    await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());

    await user.type(screen.getByRole('textbox', { name: 'Replace with' }), 'omega');
    await user.click(screen.getByRole('button', { name: 'Replace All' }));
    await waitFor(() => expect(area()).toHaveValue('omega\nbeta\nomega\n'));
  });

  it('reports a broken regular expression', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    command(windowId, 'edit', 'find').onSelect?.();
    await user.click(await screen.findByRole('button', { name: 'Regular expression' }));
    await user.type(screen.getByRole('textbox', { name: 'Find' }), '(a');
    await waitFor(() => expect(screen.getByText('Bad expression')).toBeInTheDocument());
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { windowId } = mount(null);
    command(windowId, 'edit', 'find').onSelect?.();
    const query = await screen.findByRole('textbox', { name: 'Find' });
    await user.type(query, '{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Find' })).not.toBeInTheDocument(),
    );
  });
});

describe('view', () => {
  it('turns word wrap and line numbers on and off', async () => {
    const { windowId } = mount(join(home, 'notes.txt'));
    await waitFor(() => expect(area()).toHaveValue('alpha\nbeta\nalpha\n'));
    expect(area()).toHaveAttribute('wrap', 'off');
    command(windowId, 'view', 'word-wrap').onSelect?.();
    await waitFor(() => expect(area()).toHaveAttribute('wrap', 'soft'));
    command(windowId, 'view', 'line-numbers').onSelect?.();
    await waitFor(() => expect(command(windowId, 'view', 'line-numbers').checked).toBe(false));
  });

  it('offers a preview only for Markdown, and renders it', async () => {
    await kernel.vfs.writeText(join(home, 'read.md'), '# Title\n\nBody **bold**.\n');
    const { windowId } = mount(join(home, 'read.md'));
    await waitFor(() => expect(area()).toHaveValue('# Title\n\nBody **bold**.\n'));
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeInTheDocument();
    command(windowId, 'view', 'preview').onSelect?.();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title'),
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });
});

describe('large files', () => {
  it('opens read-only past the limit', async () => {
    const path = join(home, 'huge.log');
    await kernel.vfs.writeText(path, 'x'.repeat(LARGE_FILE_LIMIT + 1));
    mount(path);
    await waitFor(() => expect(screen.getByText(/larger than 2 MB/)).toBeInTheDocument());
    expect(area()).toHaveAttribute('readonly');
  });
});

describe('definition', () => {
  it('matches the app contract', () => {
    expect(definition.id).toBe('lumen.editor');
    expect(definition.name).toBe('Text Editor');
    expect(definition.category).toBe('utilities');
    expect(definition.window).toMatchObject({ width: 780, height: 540 });
    const association = definition.fileAssociations?.[0];
    expect(association?.role).toBe('editor');
    expect(association?.extensions).toContain('.md');
    expect(association?.extensions).toContain('.tsx');
  });
});

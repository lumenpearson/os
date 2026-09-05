import {
  type AppDefinition,
  type AppManifest,
  createKernel,
  type Kernel,
  useMenuStore,
  useProcessStore,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import { CATALOGUE } from './catalogue';
import { LUMEN_PATHS_MIME } from './drop';
import definition from './index';
import Software from './Software';

const EDITOR: AppDefinition = {
  id: 'lumen.editor',
  name: 'Text Editor',
  description: 'Plain-text editing with line numbers.',
  category: 'utilities',
  icon: () => null,
  component: () => null,
  window: { width: 700, height: 500, minWidth: 300, minHeight: 200 },
  fileAssociations: [{ extensions: ['.txt', '.md'], role: 'editor' }],
  keywords: ['notepad'],
};

const TIMER: AppManifest = {
  id: 'user.timer',
  name: 'Timer',
  description: 'Counts down from five minutes.',
  version: '1.0',
  category: 'utilities',
  html: '<b>timer</b>',
};

let kernel: Kernel;
let windowId: string;

async function mount(preinstall: AppManifest[] = []) {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: () => null }, EDITOR],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  for (const manifest of preinstall) await kernel.installApp(manifest);
  const process = kernel.launch('lumen.software');
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.software', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Software pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await screen.findByRole('radio', { name: 'Installed' });
}

const list = () => screen.getByRole('list', { name: 'Installed apps' });
const rowNames = () =>
  within(list())
    .getAllByRole('button', { name: /.*/ })
    .map((b) => b.textContent ?? '');

async function show(section: string) {
  await userEvent.click(screen.getByRole('radio', { name: section }));
}

async function paste(json: string) {
  await show('Install');
  fireEvent.change(screen.getByLabelText('Manifest JSON'), { target: { value: json } });
}

afterEach(cleanup);

describe('the installed list', () => {
  beforeEach(async () => {
    await mount([TIMER]);
  });

  it('shows built-in apps and installed programs together', () => {
    expect(within(list()).getByText('Text Editor')).toBeInTheDocument();
    expect(within(list()).getByText('Software Center')).toBeInTheDocument();
    expect(within(list()).getByText('Timer')).toBeInTheDocument();
    expect(within(list()).getAllByText('system')).toHaveLength(2);
    expect(within(list()).getAllByText('installed')).toHaveLength(1);
  });

  it('counts the two kinds in the status bar', () => {
    expect(screen.getByText('2 built-in')).toBeInTheDocument();
    expect(screen.getByText('1 installed')).toBeInTheDocument();
  });

  it('narrows the list with the search field', async () => {
    await userEvent.type(screen.getByLabelText('Search apps'), 'timer');
    await waitFor(() => expect(rowNames().join(' ')).not.toContain('Text Editor'));
    expect(within(list()).getByText('Timer')).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    await userEvent.type(screen.getByLabelText('Search apps'), 'zzz');
    expect(await screen.findByText('No apps match')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'system');
    await waitFor(() => expect(within(list()).queryByText('Timer')).not.toBeInTheDocument());
    expect(within(list()).getByText('Software Center')).toBeInTheDocument();
  });

  it('opens an app from its row', async () => {
    const rows = within(list()).getAllByRole('button', { name: 'Open' });
    const first = rows[0];
    if (!first) throw new Error('no Open button');
    await userEvent.click(first);
    expect(useProcessStore.getState().findByApp('lumen.software').length).toBeGreaterThan(0);
  });
});

describe('the details pane', () => {
  beforeEach(async () => {
    await mount([TIMER]);
  });

  it('prints the identifier, window defaults and file associations of a built-in', async () => {
    await userEvent.click(screen.getByText('Text Editor'));
    expect(await screen.findByText('lumen.editor')).toBeInTheDocument();
    expect(screen.getByText('Built-in app')).toBeInTheDocument();
    expect(screen.getByText('700×500 (min 300×200)')).toBeInTheDocument();
    expect(screen.getByText('.txt .md')).toBeInTheDocument();
  });

  it('will not remove a built-in, and says why', async () => {
    await userEvent.click(screen.getByText('Text Editor'));
    expect(await screen.findByText(/Part of Lumen OS/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('prints the manifest path, the install date and what a program can do', async () => {
    await userEvent.click(screen.getByText('Timer'));
    expect(await screen.findByText('/Applications/Timer.app')).toBeInTheDocument();
    expect(screen.getByText('HTML program')).toBeInTheDocument();
    expect(
      screen.getByText('Runs HTML in a sandboxed frame: no access to your files.'),
    ).toBeInTheDocument();
    // "Installed" is also the name of a section button, so this has to ask for
    // the term in the details list specifically, and read the value beside it.
    const installedAt = screen.getByText('Installed', { selector: 'dt' }).nextElementSibling;
    expect(installedAt?.textContent).not.toContain('\u2014');
  });
});

describe('removing an app', () => {
  beforeEach(async () => {
    await mount([TIMER]);
    await userEvent.click(screen.getByText('Timer'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  });

  it('says exactly what will be deleted and what is kept', async () => {
    expect(await screen.findByText('Remove Timer?')).toBeInTheDocument();
    const message = screen.getByText(/moves to the Trash/);
    expect(message.textContent).toContain('/Applications/Timer.app');
    // The home directory is named after the account the test kernel creates,
    // so ask it rather than spelling the path out and drifting from it.
    expect(message.textContent).toContain(`${kernel.home}/.appdata/user.timer.json`);
    expect(message.textContent).toContain('does not delete it');
  });

  it('keeps the app when the confirmation is dismissed', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Remove Timer?')).not.toBeInTheDocument());
    expect(await kernel.vfs.exists('/Applications/Timer.app')).toBe(true);
  });

  it('moves the manifest to the Trash when confirmed', async () => {
    const buttons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(buttons[buttons.length - 1] as HTMLElement);
    await waitFor(async () =>
      expect(await kernel.vfs.exists('/Applications/Timer.app')).toBe(false),
    );
    await waitFor(() => expect(within(list()).queryByText('Timer')).not.toBeInTheDocument());
  });
});

describe('installing from pasted JSON', () => {
  beforeEach(async () => {
    await mount();
  });

  it('reports malformed JSON and refuses to install it', async () => {
    await paste('{ "id": ');
    expect(await screen.findByText(/^Not valid JSON/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('names every missing field at once', async () => {
    await paste('{}');
    expect(await screen.findByText('3 problems')).toBeInTheDocument();
    expect(screen.getByText(/Give the app an identifier/)).toBeInTheDocument();
    expect(screen.getByText(/name shown in the Start menu/)).toBeInTheDocument();
    expect(screen.getByText(/"alias", "html" or "script"/)).toBeInTheDocument();
  });

  it('warns about unknown fields without blocking the install', async () => {
    await paste(JSON.stringify({ ...TIMER, author: 'ada' }));
    expect(await screen.findByText('1 warning')).toBeInTheDocument();
    expect(screen.getByText(/Unknown field/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('refuses an id that belongs to a built-in app', async () => {
    await paste(JSON.stringify({ ...TIMER, id: 'lumen.editor' }));
    expect(
      await screen.findByText(/is the identifier of an app built into Lumen OS/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('states what the program will be allowed to do before installing it', async () => {
    await paste(JSON.stringify(TIMER));
    expect(
      await screen.findByText('Runs HTML in a sandboxed frame: no access to your files.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Appears in the Start menu/)).toBeInTheDocument();
    expect(screen.getByText(/Writes \/Applications\/Timer\.app/)).toBeInTheDocument();
  });

  it('writes the manifest and shows the app as installed', async () => {
    await paste(JSON.stringify(TIMER));
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(async () =>
      expect(await kernel.vfs.readText('/Applications/Timer.app')).toContain('user.timer'),
    );
    expect(await within(list()).findByText('Timer')).toBeInTheDocument();
  });

  it('offers to replace a program that is already installed under the same id', async () => {
    await paste(JSON.stringify(TIMER));
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await within(list()).findByText('Timer');
    await paste(JSON.stringify({ ...TIMER, version: '2.0' }));
    expect(await screen.findByRole('button', { name: 'Replace' })).toBeEnabled();
    expect(screen.getByText(/Replaces the installed Timer/)).toBeInTheDocument();
  });
});

describe('installing from a file', () => {
  beforeEach(async () => {
    await mount();
    await show('Install');
  });

  const zone = () => document.querySelector('[data-dragging]') as HTMLElement;

  it('marks the drop target while a manifest is over it', () => {
    const payload = { types: [LUMEN_PATHS_MIME] };
    fireEvent.dragEnter(zone(), { dataTransfer: payload });
    expect(zone().dataset.dragging).toBe('true');
    fireEvent.dragLeave(zone(), { dataTransfer: payload });
    expect(zone().dataset.dragging).toBe('false');
  });

  it('ignores a drag that carries no file', () => {
    fireEvent.dragEnter(zone(), { dataTransfer: { types: ['text/plain'] } });
    expect(zone().dataset.dragging).toBe('false');
  });

  it('reads a dropped .app file and reports on it', async () => {
    // The account directory is derived from the display name, so the fixture
    // has to ask the kernel where home is rather than assume a shorter one.
    const dropped = `${kernel.home}/Timer.app`;
    await kernel.vfs.writeText(dropped, JSON.stringify(TIMER));
    fireEvent.drop(zone(), {
      dataTransfer: {
        types: [LUMEN_PATHS_MIME],
        getData: () => JSON.stringify([dropped]),
        files: [],
      },
    });
    expect(await screen.findByText(dropped)).toBeInTheDocument();
    expect(screen.getByLabelText('Manifest JSON')).toHaveValue(JSON.stringify(TIMER));
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('opens the file picker from the keyboard-reachable button', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Choose File…' }));
    expect(await screen.findByText('Install from File')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });
});

describe('the catalogue', () => {
  beforeEach(async () => {
    await mount();
    await show('Catalogue');
  });

  it('lists every bundled program', () => {
    for (const manifest of CATALOGUE) {
      expect(screen.getByRole('heading', { name: manifest.name })).toBeInTheDocument();
    }
  });

  it('narrows the cards with the search field', async () => {
    await userEvent.type(screen.getByLabelText('Search apps'), 'pomodoro');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'JSON Formatter' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Pomodoro Timer' })).toBeInTheDocument();
  });

  it('installs a program in one press and shows it among the installed apps', async () => {
    const cards = screen.getAllByRole('button', { name: 'Install' });
    const first = cards[0];
    if (!first) throw new Error('nothing to install');
    await userEvent.click(first);
    await waitFor(async () =>
      expect(await kernel.vfs.exists('/Applications/Unit Converter.app')).toBe(true),
    );
    expect(await within(list()).findByText('Unit Converter')).toBeInTheDocument();
  });
});

describe('the menubar', () => {
  beforeEach(async () => {
    await mount();
  });

  it('contributes File, Edit and View', () => {
    expect(useMenuStore.getState().byWindow[windowId]?.map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'View',
    ]);
  });

  // A menu command is a React state update made from outside the event system,
  // so it has to be flushed before the window can be asked what it shows.
  it('moves between sections from the View menu', async () => {
    const view = useMenuStore.getState().byWindow[windowId]?.[2];
    await act(async () => {
      view?.items[2]?.onSelect?.();
    });
    expect(screen.getByRole('radio', { name: 'Catalogue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('takes the window to the Install section to paste a manifest', async () => {
    const file = useMenuStore.getState().byWindow[windowId]?.[0];
    await act(async () => {
      file?.items[1]?.onSelect?.();
    });
    expect(await screen.findByLabelText('Manifest JSON')).toBeInTheDocument();
  });
});

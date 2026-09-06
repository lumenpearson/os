import {
  type AppDefinition,
  type AppManifest,
  createKernel,
  DEFAULT_STORE_ORIGIN,
  type Kernel,
  useMenuStore,
  useProcessStore,
  useRegistryStore,
  useSettingsStore,
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
import { buildStore, DESK, SEVEN, STOPWATCH, STOPWATCH_MANIFEST, type StoreFiles } from './fixture';
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
let files: StoreFiles = new Map();
let offline = false;
let requests: string[] = [];
const encoder = new TextEncoder();

/** The store as a set of files at a base URL; anything else is a 404. */
function serve() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (offline) throw new TypeError('Failed to fetch');
    const body = files.get(url);
    if (body === undefined) return new Response('missing', { status: 404 });
    return new Response(body, {
      status: 200,
      headers: { 'content-length': String(encoder.encode(body).byteLength) },
    });
  }) as typeof fetch;
}

async function boot(preinstall: AppManifest[] = []) {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: () => null }, EDITOR],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  for (const manifest of preinstall) await kernel.installApp(manifest);
}

async function openWindow() {
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

async function mount(preinstall: AppManifest[] = []) {
  await boot(preinstall);
  await openWindow();
}

const list = () => screen.getByRole('list', { name: 'Installed apps' });
/**
 * The running installs. A finished job and the package's own page both state
 * the outcome — the row is the log of what happened, the page is what is true
 * now — so an assertion about the install itself says which it means.
 */
const jobs = () => within(screen.getByRole('list', { name: 'Installs' }));
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

/** The store tile for a package, which is the button carrying its name. */
function tile(name: string): HTMLElement {
  const found = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.includes(name) && button.textContent?.includes('·'));
  if (!found) throw new Error(`no tile for ${name}`);
  return found;
}

beforeEach(async () => {
  requests = [];
  offline = false;
  files = (await buildStore(DEFAULT_STORE_ORIGIN)).files;
  serve();
});

afterEach(cleanup);

describe('the store', () => {
  beforeEach(async () => {
    await mount();
    await screen.findByRole('heading', { name: 'Recently updated' });
  });

  it('opens on the store and draws the catalogue it fetched', () => {
    expect(screen.getByRole('radio', { name: 'Store' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Two programs to start with')).toBeInTheDocument();
    // A collection is a card you press, so its title is the button's own
    // label rather than a heading inside it.
    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quiet tools/ })).toBeInTheDocument();
    expect(screen.getByText('Fetched moments ago.')).toBeInTheDocument();
  });

  it('shows name, publisher, tagline, size and price on a tile', () => {
    const stopwatch = tile('Stopwatch');
    expect(stopwatch.textContent).toContain('Lumen');
    expect(stopwatch.textContent).toContain('Laps, splits');
    expect(stopwatch.textContent).toContain('App');
    expect(stopwatch.textContent).toContain('Free');
    expect(stopwatch.textContent).toMatch(/\d+ B/);
  });

  it('folds the programs that ship with the OS into the same shelves', () => {
    const shelf = screen.getByRole('region', { name: 'Ships with Lumen OS' });
    for (const manifest of CATALOGUE) {
      expect(within(shelf).getByText(manifest.name)).toBeInTheDocument();
    }
    expect(screen.getByText(`${3 + CATALOGUE.length} in the catalogue`)).toBeInTheDocument();
  });

  it('opens a package on its own page, with what it needs and what it changed', async () => {
    await userEvent.click(tile('Stopwatch'));
    expect(await screen.findByRole('heading', { name: 'Stopwatch' })).toBeInTheDocument();
    expect(screen.getByText('It keeps counting when the window is closed.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New in 2.1.0' })).toBeInTheDocument();
    expect(screen.getByText('Laps now survive a reload.')).toBeInTheDocument();
    expect(
      screen.getByText('Saves data of its own under your home directory.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Lumen OS >=0.1.0')).toBeInTheDocument();
    expect(screen.getByText(STOPWATCH)).toBeInTheDocument();
  });

  it('shows a bundle as the packages it installs', async () => {
    await userEvent.click(tile('Desk Kit'));
    expect(await screen.findByRole('heading', { name: 'Installs 2 packages' })).toBeInTheDocument();
    expect(screen.getByText('Seven Segment')).toBeInTheDocument();
  });

  it('opens a collection from its card', async () => {
    await userEvent.click(screen.getByRole('button', { name: /Quiet tools/ }));
    expect(await screen.findByRole('button', { name: 'All shelves' })).toBeInTheDocument();
    expect(screen.getByText('Programs that stay out of the way.')).toBeInTheDocument();
  });

  it('searches the store and the system programs together', async () => {
    await userEvent.type(screen.getByLabelText('Search the store'), 'seven');
    expect(await screen.findByRole('heading', { name: '1 package' })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search the store'));
    await userEvent.type(screen.getByLabelText('Search the store'), 'pomodoro');
    expect(await screen.findByRole('heading', { name: '1 package' })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    await userEvent.type(screen.getByLabelText('Search the store'), 'zzz');
    expect(await screen.findByText('No package matches')).toBeInTheDocument();
  });

  it('narrows by kind', async () => {
    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'font');
    expect(await screen.findByRole('heading', { name: '1 package' })).toBeInTheDocument();
    expect(screen.getByText('Seven Segment')).toBeInTheDocument();
  });

  it('refreshes from the toolbar', async () => {
    requests = [];
    await userEvent.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
    await waitFor(() => expect(requests).toContain(`${DEFAULT_STORE_ORIGIN}index.json`));
  });
});

describe('installing from the store', () => {
  beforeEach(async () => {
    await mount();
    await screen.findByRole('heading', { name: 'Recently updated' });
  });

  async function get(name: string) {
    await userEvent.click(tile(name));
    await userEvent.click(await screen.findByRole('button', { name: 'Get' }));
  }

  it('downloads, verifies and installs an app through the same path as a file', async () => {
    await get('Stopwatch');
    await waitFor(async () =>
      expect(await kernel.vfs.exists('/Applications/Stopwatch.app')).toBe(true),
    );
    expect(
      await jobs().findByText(/Written to \/Applications\/Stopwatch\.app/),
    ).toBeInTheDocument();
    const written = JSON.parse(await kernel.vfs.readText('/Applications/Stopwatch.app')) as {
      id: string;
    };
    expect(written.id).toBe(STOPWATCH);
    await show('Installed');
    expect(await within(list()).findByText('Stopwatch')).toBeInTheDocument();
  });

  it('writes a typeface under the home directory and records it', async () => {
    await get('Seven Segment');
    const path = `${kernel.home}/.store/fonts/${SEVEN}.json`;
    await waitFor(async () => expect(await kernel.vfs.exists(path)).toBe(true));
    expect(await screen.findByText(new RegExp(`Typeface written to ${path}`))).toBeInTheDocument();
    const record = await kernel.vfs.readJson<{ resources: Array<{ id: string }> }>(
      `${kernel.home}/.store/resources.json`,
    );
    expect(record.resources.map((r) => r.id)).toEqual([SEVEN]);
  });

  it('installs a bundle member by member, one row each, in order', async () => {
    await get('Desk Kit');
    const installs = await screen.findByRole('list', { name: 'Installs' });
    await waitFor(async () =>
      expect(await kernel.vfs.exists(`${kernel.home}/.store/fonts/${SEVEN}.json`)).toBe(true),
    );
    const rows = within(installs).getAllByRole('listitem');
    const text = rows.map((r) => r.textContent ?? '').join(' | ');
    expect(text).toContain('Stopwatch');
    expect(text).toContain('Seven Segment');
    expect(text.indexOf('Stopwatch')).toBeLessThan(text.indexOf('Seven Segment'));
    expect(await screen.findByText(/2 packages: com\.lumen\.stopwatch and/)).toBeInTheDocument();
  });

  it('refuses a payload whose checksum is not the one the catalogue named', async () => {
    // Same number of bytes, different bytes. The length is checked first and
    // would otherwise be what refuses this, and the length is not what this
    // test is about.
    const payloadUrl = `${DEFAULT_STORE_ORIGIN}payload/${STOPWATCH}-2.1.0.json`;
    const honest = files.get(payloadUrl) as string;
    files.set(payloadUrl, honest.replace('Stopwatch', 'Stopwatcz'));
    await get('Stopwatch');
    expect(await jobs().findByText(/its checksum is/)).toBeInTheDocument();
    expect(await kernel.vfs.exists('/Applications/Stopwatch.app')).toBe(false);
  });

  it('says the connection failed when the payload cannot be fetched', async () => {
    await userEvent.click(tile('Stopwatch'));
    const button = await screen.findByRole('button', { name: 'Get' });
    offline = true;
    await userEvent.click(button);
    expect(await jobs().findByText(/could not be reached/)).toBeInTheDocument();
    expect(await kernel.vfs.exists('/Applications/Stopwatch.app')).toBe(false);
  });

  it('names the member a bundle asks for that the catalogue does not list', async () => {
    const document = JSON.parse(
      files.get(`${DEFAULT_STORE_ORIGIN}packages/${DESK}.json`) as string,
    ) as {
      members: string[];
    };
    document.members = [STOPWATCH, 'com.lumen.ghost'];
    files.set(`${DEFAULT_STORE_ORIGIN}packages/${DESK}.json`, JSON.stringify(document));
    await get('Desk Kit');
    expect(
      await screen.findByText(
        /needs com\.lumen\.ghost, which this store's catalogue does not list/,
      ),
    ).toBeInTheDocument();
    expect(await kernel.vfs.exists('/Applications/Stopwatch.app')).toBe(false);
  });

  it('installs a program that ships with the OS with no download at all', async () => {
    requests = [];
    const bundled = CATALOGUE[0];
    if (!bundled) throw new Error('empty catalogue');
    await userEvent.click(tile(bundled.name));
    await userEvent.click(await screen.findByRole('button', { name: 'Get' }));
    await waitFor(async () =>
      expect(await kernel.vfs.exists(`/Applications/${bundled.name}.app`)).toBe(true),
    );
    expect(requests).toEqual([]);
  });
});

describe('when the store cannot be reached', () => {
  it('says which address it tried, and still shows what ships with the OS', async () => {
    offline = true;
    await mount();
    expect(await screen.findByText('The store could not be reached')).toBeInTheDocument();
    // Matched as text, not as a pattern. A URL compiled into a regular
    // expression has unescaped dots, so it would also match addresses nobody
    // meant; the assertion is that this exact one is on screen.
    const showing = screen.getAllByText(
      (_, node) => node?.textContent?.includes(DEFAULT_STORE_ORIGIN) === true,
      { selector: 'p, span, code' },
    );
    expect(showing.length).toBeGreaterThan(0);
    const shelf = screen.getByRole('region', { name: 'Ships with Lumen OS' });
    expect(within(shelf).getByText('Pomodoro Timer')).toBeInTheDocument();
  });

  it('refuses a catalogue it cannot read, whole', async () => {
    files.set(`${DEFAULT_STORE_ORIGIN}index.json`, '{ "format": 1, "packages": ');
    await mount();
    expect(await screen.findByText('The catalogue could not be read')).toBeInTheDocument();
  });

  it('falls back to the copy that ships beside the OS', async () => {
    const bundled = new URL('/store/', globalThis.location.href).href;
    const copy = await buildStore(bundled);
    for (const [url, body] of copy.files) files.set(url, body);
    files.delete(`${DEFAULT_STORE_ORIGIN}index.json`);
    await mount();
    expect(
      await screen.findByText(/Showing the catalogue that ships with Lumen OS/),
    ).toBeInTheDocument();
    expect(screen.getByText('Seven Segment')).toBeInTheDocument();
  });

  /** Open once with the store reachable, so a catalogue is kept, then go dark. */
  async function reopenOffline() {
    await mount();
    await screen.findByRole('heading', { name: 'Recently updated' });
    await waitFor(async () =>
      expect(await kernel.vfs.exists(`${kernel.home}/.store/catalogue.json`)).toBe(true),
    );
    cleanup();
    offline = true;
    await openWindow();
  }

  it('draws the catalogue it kept last time, and says how old it is', async () => {
    await reopenOffline();
    // A cache this fresh is not worth a request, so the store is never asked
    // and there is no failure to report — only how old what is drawn is.
    expect(
      await screen.findByText('Kept from a previous session, fetched moments ago.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Seven Segment')).toBeInTheDocument();
  });

  it('says the store could not be reached when a refresh fails, and keeps what it had', async () => {
    await reopenOffline();
    await screen.findByText('Kept from a previous session, fetched moments ago.');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(
      await screen.findByText(/The store could not be reached\. Showing the catalogue fetched/),
    ).toBeInTheDocument();
    // The failure does not take the shelves down with it.
    expect(screen.getByText('Seven Segment')).toBeInTheDocument();
  });
});

describe('the installed list', () => {
  beforeEach(async () => {
    await mount([TIMER]);
    await show('Installed');
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
    await show('Installed');
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
    expect(installedAt?.textContent).not.toContain('—');
  });
});

describe('removing an app', () => {
  beforeEach(async () => {
    await mount([TIMER]);
    await show('Installed');
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
      view?.items[1]?.onSelect?.();
    });
    expect(screen.getByRole('radio', { name: 'Installed' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('refreshes the catalogue from the View menu', async () => {
    await screen.findByRole('heading', { name: 'Recently updated' });
    requests = [];
    const view = useMenuStore.getState().byWindow[windowId]?.[2];
    await act(async () => {
      view?.items[4]?.onSelect?.();
    });
    await waitFor(() => expect(requests).toContain(`${DEFAULT_STORE_ORIGIN}index.json`));
  });

  it('takes the window to the Install section to paste a manifest', async () => {
    const file = useMenuStore.getState().byWindow[windowId]?.[0];
    await act(async () => {
      file?.items[1]?.onSelect?.();
    });
    expect(await screen.findByLabelText('Manifest JSON')).toBeInTheDocument();
  });
});

/**
 * An installed package the catalogue has moved past. The fixture serves
 * Stopwatch 2.1.0, so a copy of 2.0.0 on the system is exactly one update.
 */
describe('updates', () => {
  const OLD_STOPWATCH: AppManifest = { ...STOPWATCH_MANIFEST, version: '2.0.0' } as AppManifest;

  const installedVersion = () =>
    Object.values(useRegistryStore.getState().installed).find((a) => a.manifest.id === STOPWATCH)
      ?.manifest.version ?? null;

  async function mountWith(automatic: boolean, manifest: AppManifest = OLD_STOPWATCH) {
    await boot([manifest]);
    useSettingsStore.getState().patch('updates', { automatic });
    await openWindow();
    await show('Installed');
  }

  it('says how many, and which versions, when the store is ahead', async () => {
    await mountWith(false);
    expect(await screen.findByText('1 update available')).toBeInTheDocument();
    expect(screen.getByText(/Stopwatch 2\.0\.0 → 2\.1\.0/)).toBeInTheDocument();
  });

  it('says nothing when the system is already on the catalogue version', async () => {
    await mountWith(false, STOPWATCH_MANIFEST as AppManifest);
    await screen.findByRole('list', { name: 'Installed apps' });
    expect(screen.queryByText(/update available/)).not.toBeInTheDocument();
  });

  it('installs the newer version when Update All is pressed', async () => {
    await mountWith(false);
    expect(installedVersion()).toBe('2.0.0');
    await userEvent.click(await screen.findByRole('button', { name: 'Update All' }));
    await waitFor(() => expect(installedVersion()).toBe('2.1.0'));
  });

  it('waits to be asked while automatic updates are off', async () => {
    await mountWith(false);
    await screen.findByText('1 update available');
    expect(installedVersion()).toBe('2.0.0');
  });

  it('installs on its own when automatic updates are on, with nothing pressed', async () => {
    await mountWith(true);
    await waitFor(() => expect(installedVersion()).toBe('2.1.0'));
    // Nothing to ask for once it is done, and nothing was asked for on the way.
    expect(screen.queryByRole('button', { name: 'Update All' })).not.toBeInTheDocument();
  });

  it('starts each version once, however often the library changes under it', async () => {
    await mountWith(true);
    await waitFor(() => expect(installedVersion()).toBe('2.1.0'));
    const downloads = requests.filter((url) => url.includes('payload/'));
    await act(async () => {
      await kernel.installApp({ ...STOPWATCH_MANIFEST, name: 'Stopwatch' } as AppManifest);
    });
    await waitFor(() => expect(installedVersion()).toBe('2.1.0'));
    expect(requests.filter((url) => url.includes('payload/'))).toEqual(downloads);
  });
});

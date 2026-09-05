/**
 * The Mail window. These exercise the shell — the toolbar, the panes, the
 * compose sheet and what reaches the file — rather than the threading, the
 * search grammar or the formatting, which have their own tests next door.
 */

import { createKernel, type Kernel, useMenuStore, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Mail from './Mail';
import type { MailData } from './store';

const Dummy = () => null;

/**
 * happy-dom gives every element a zero size and its ResizeObserver is a stub,
 * so the window would measure as too narrow for the three panes. This one
 * reports a real box, which is what a browser does on the first observation.
 */
let viewport = { width: 1100, height: 700 };

class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const { width, height } = viewport;
    const entry = {
      target,
      contentRect: { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalObserver = globalThis.ResizeObserver;

/** A fixed instant so the stamps never move under the assertions. */
const NOW = new Date('2026-09-04T10:30:00Z');

let kernel: Kernel;
let home: string;
let windowId: string;

/** Let the pending VFS reads and the state updates they cause land. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** Past the 250 ms write debounce, so the mailbox file is on disk. */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

async function mount() {
  const process = kernel.launch('lumen.mail', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.mail', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Mail pid={process.pid} windowId={windowId} args={{}} />
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
  await settle();
}

const dataPath = () => join(home, '.config', 'mail.json');
const saved = () => kernel.vfs.readJson<MailData>(dataPath());

const list = () => screen.getByRole('listbox', { name: 'Messages' });
const rows = () => within(list()).getAllByRole('option');
const mailboxButton = (name: RegExp) => screen.getByRole('button', { name });

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await settle();
}

beforeEach(async () => {
  viewport = { width: 1100, height: 700 };
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  useSettingsStore.getState().patch('region', { locale: 'en-GB', timeZone: 'UTC' });
  useSettingsStore.getState().patch('menubar', { clock24h: true });
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  vi.useRealTimers();
});

describe('the app definition', () => {
  it('is the mail client the shell expects', () => {
    expect(definition.id).toBe('lumen.mail');
    expect(definition.name).toBe('Mail');
    expect(definition.category).toBe('internet');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toMatchObject({ minWidth: 420, minHeight: 340 });
  });
});

describe('the first run', () => {
  it('seeds two messages that say where the mail lives', async () => {
    await mount();
    expect(rows()).toHaveLength(2);
    expect(screen.getByText('This mailbox is on your computer')).toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    await flush();
    const file = await saved();
    expect(file.seeded).toBe(true);
    expect(file.messages).toHaveLength(2);
    expect(file.messages[0]?.from).toBe('Lumen <system@local>');
  });

  it('says in the sidebar that nothing leaves the computer', async () => {
    await mount();
    expect(screen.getByText(/Nothing is sent or received over a network/i)).toBeInTheDocument();
  });

  it('does not seed again over a mailbox the user has emptied', async () => {
    await kernel.vfs.writeJson(
      dataPath(),
      { seeded: true, messages: [], folders: [], prefs: {} },
      { recursive: true },
    );
    await mount();
    expect(screen.getByText('No messages')).toBeInTheDocument();
    await flush();
    expect((await saved()).messages).toHaveLength(0);
  });
});

describe('reading', () => {
  it('opens a message in the reading pane and marks it read after a moment', async () => {
    await mount();
    const first = rows()[0] as HTMLElement;
    await click(first);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Keyboard shortcuts');
    expect(mailboxButton(/^Inbox/)).toHaveTextContent('2');

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await settle();
    expect(mailboxButton(/^Inbox/)).toHaveTextContent('1');
  });

  it('leaves a message unread when the selection moves straight on', async () => {
    await mount();
    await click(rows()[0] as HTMLElement);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await click(rows()[1] as HTMLElement);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await settle();
    expect(mailboxButton(/^Inbox/)).toHaveTextContent('2');
  });
});

describe('composing', () => {
  async function composeMessage(
    user: ReturnType<typeof userEvent.setup>,
    fields: { to: string; subject: string; body: string },
  ) {
    await choose('file', 'new-message');
    await user.type(screen.getByLabelText('To'), fields.to);
    await user.type(screen.getByLabelText('Subject'), fields.subject);
    await user.type(screen.getByLabelText('Message'), fields.body);
  }

  it('sends to Sent and delivers a copy back to the Inbox', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await composeMessage(user, { to: 'grace@local', subject: 'Punched cards', body: 'Ready.' });
    await click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.queryByLabelText('To')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(3);
    expect(screen.getByText('Punched cards')).toBeInTheDocument();

    await click(mailboxButton(/^Sent/));
    expect(rows()).toHaveLength(1);

    await flush();
    const file = await saved();
    const sent = file.messages.filter((m) => m.mailbox === 'sent');
    const delivered = file.messages.filter(
      (m) => m.mailbox === 'inbox' && m.subject === 'Punched cards',
    );
    expect(sent).toHaveLength(1);
    expect(delivered).toHaveLength(1);
    expect(sent[0]?.to).toEqual(['grace@local']);
    expect(sent[0]?.from).toContain('Ada Lovelace');
  });

  it('will not send a message addressed to nobody', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('file', 'new-message');
    await user.type(screen.getByLabelText('Subject'), 'Nowhere');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('saves a draft into Drafts and reopens it for editing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await composeMessage(user, { to: 'grace@local', subject: 'Half done', body: 'Later.' });
    await click(screen.getByRole('button', { name: 'Save Draft' }));

    await click(mailboxButton(/^Drafts/));
    expect(rows()).toHaveLength(1);

    await act(async () => {
      (rows()[0] as HTMLElement).dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      );
    });
    await settle();
    expect(screen.getByLabelText('Subject')).toHaveValue('Half done');
  });

  it('quotes the message it replies to without stacking prefixes', async () => {
    await mount();
    await click(rows()[1] as HTMLElement);
    await choose('message', 'reply');

    expect(screen.getByLabelText('To')).toHaveValue('Lumen <system@local>');
    expect(screen.getByLabelText('Subject')).toHaveValue('Re: This mailbox is on your computer');
    const body = screen.getByLabelText('Message') as HTMLTextAreaElement;
    expect(body.value).toContain('> This is a mailbox on this computer.');
    expect(body.value).toContain('Lumen wrote:');
  });

  it('forwards with a header block and no recipient yet', async () => {
    await mount();
    await click(rows()[1] as HTMLElement);
    await choose('message', 'forward');
    expect(screen.getByLabelText('To')).toHaveValue('');
    expect(screen.getByLabelText('Subject')).toHaveValue('Fwd: This mailbox is on your computer');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain(
      'Forwarded message',
    );
  });
});

describe('filing', () => {
  it('archives the selected message', async () => {
    await mount();
    await click(rows()[0] as HTMLElement);
    await choose('message', 'archive');
    expect(rows()).toHaveLength(1);
    await click(mailboxButton(/^Archive/));
    expect(rows()).toHaveLength(1);
  });

  it('deletes to the Trash first and for good the second time', async () => {
    await mount();
    await click(rows()[0] as HTMLElement);
    await choose('message', 'delete');
    await click(mailboxButton(/^Trash/));
    expect(rows()).toHaveLength(1);

    await click(rows()[0] as HTMLElement);
    expect(command('message', 'delete').label).toBe('Delete Permanently');
    await choose('message', 'delete');
    expect(screen.getByText('No messages')).toBeInTheDocument();

    await flush();
    expect((await saved()).messages).toHaveLength(1);
  });

  it('moves a message back out of the Trash', async () => {
    await mount();
    await click(rows()[0] as HTMLElement);
    await choose('message', 'delete');
    await click(mailboxButton(/^Trash/));
    await click(rows()[0] as HTMLElement);
    await choose('message', 'restore');
    expect(screen.getByText('No messages')).toBeInTheDocument();
    await click(mailboxButton(/^Inbox/));
    expect(rows()).toHaveLength(2);
  });

  it('flags a message and marks it unread again', async () => {
    await mount();
    await click(rows()[0] as HTMLElement);
    await choose('message', 'flag');
    expect(within(list()).getByRole('img', { name: 'Flagged' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await settle();
    expect(mailboxButton(/^Inbox/)).toHaveTextContent('1');

    await choose('message', 'toggle-read');
    expect(mailboxButton(/^Inbox/)).toHaveTextContent('2');

    // Marking the message in front of you unread has to stick: the reading
    // pane does not get to change its mind a second later.
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await settle();
    expect(mailboxButton(/^Inbox/)).toHaveTextContent('2');
  });
});

describe('searching', () => {
  it('filters the list on a query and says so when nothing matches', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    const search = screen.getByRole('searchbox', { name: 'Search mail' });
    await user.type(search, 'shortcuts');
    await settle();
    expect(rows()).toHaveLength(1);

    await user.clear(search);
    await user.type(search, 'from:nobody');
    await settle();
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('reaches into another mailbox with in:', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await click(rows()[0] as HTMLElement);
    await choose('message', 'archive');
    await user.type(screen.getByRole('searchbox', { name: 'Search mail' }), 'in:archive');
    await settle();
    expect(rows()).toHaveLength(1);
  });
});

describe('folders', () => {
  it('makes a folder from the File menu and opens it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('file', 'new-folder');
    await user.type(screen.getByRole('textbox'), 'Project X');
    await click(screen.getByRole('button', { name: 'Create' }));

    expect(mailboxButton(/^Project X/)).toBeInTheDocument();
    expect(screen.getByText('No messages')).toBeInTheDocument();
    await flush();
    expect((await saved()).folders).toEqual([{ id: 'folder:project-x', name: 'Project X' }]);
  });
});

describe('fitting the window', () => {
  it('gives the reading pane the whole width on a narrow window', async () => {
    viewport = { width: 700, height: 620 };
    await mount();
    expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument();

    await act(async () => {
      (rows()[0] as HTMLElement).dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      );
    });
    await settle();

    expect(screen.queryByRole('listbox', { name: 'Messages' })).not.toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'Back to list' });
    await click(back);
    expect(list()).toBeInTheDocument();
  });

  it('folds the mailboxes behind a control on the narrowest window', async () => {
    viewport = { width: 520, height: 520 };
    await mount();
    expect(screen.queryByRole('button', { name: /^Inbox/ })).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Mailboxes' }));
    expect(mailboxButton(/^Inbox/)).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Close mailboxes' }));
    expect(screen.queryByRole('button', { name: /^Inbox/ })).not.toBeInTheDocument();
  });
});

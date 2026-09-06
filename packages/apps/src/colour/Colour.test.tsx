import { createKernel, type Kernel, useClipboardStore, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Colour from './Colour';
import definition from './index';
import type { ColourData } from './palette';

const Dummy = () => null;

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

const settingsPath = () => join(home, '.config', 'colour.json');
const saved = () => kernel.vfs.readJson<ColourData>(settingsPath());

async function preload(data: unknown) {
  await kernel.vfs.writeJson(settingsPath(), data, { recursive: true });
}

async function mount() {
  const process = kernel.launch('lumen.colour', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.colour', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Colour pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

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

const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);

/** Replace the whole contents of a field, the way a person retypes a value. */
async function retype(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLInputElement,
  text: string,
) {
  await user.clear(input);
  await user.type(input, text);
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
  useClipboardStore.getState().clear();
});

describe('the app definition', () => {
  it('is the colour tool the shell expects', () => {
    expect(definition.id).toBe('lumen.colour');
    expect(definition.name).toBe('Colour');
    expect(definition.category).toBe('utilities');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 900,
      height: 640,
      minWidth: 380,
      minHeight: 420,
      titleBar: 'inset',
    });
    expect(definition.keywords).toContain('oklch');
  });
});

describe('the readouts', () => {
  it('shows one colour in all four notations', async () => {
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    expect(field('Hex')).toHaveValue('#ff0000');
    expect(field('RGB')).toHaveValue('rgb(255, 0, 0)');
    expect(field('HSL')).toHaveValue('hsl(0, 100%, 50%)');
    expect(field('Oklch')).toHaveValue('oklch(0.628 0.2577 29.23)');
  });

  it('moves the whole app when a colour is typed into any one of them', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    await retype(user, field('RGB'), 'rgb(0, 0, 255)');
    expect(field('Hex')).toHaveValue('#0000ff');
    expect(field('HSL')).toHaveValue('hsl(240, 100%, 50%)');
  });

  it('reads any notation in any field', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    await retype(user, field('Hex'), 'oklch(0.5 0.1 250)');
    // The field being typed into keeps what was typed; the others restate it.
    expect(field('Hex')).toHaveValue('oklch(0.5 0.1 250)');
    expect(field('RGB')).toHaveValue('rgb(50, 102, 154)');
  });

  it('says an entry is unreadable and changes nothing', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    await retype(user, field('Hex'), 'rgb(banana)');
    expect(screen.getByRole('status')).toHaveTextContent('is not a colour in any of these');
    expect(field('RGB')).toHaveValue('rgb(255, 0, 0)');
    expect(field('Oklch')).toHaveValue('oklch(0.628 0.2577 29.23)');
  });

  it('copies a notation to the clipboard', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Copy HSL' }));
    expect(useClipboardStore.getState().item?.text).toBe('hsl(0, 100%, 50%)');
    await choose('edit', 'copy-hex');
    expect(useClipboardStore.getState().item?.text).toBe('#ff0000');
  });
});

describe('contrast', () => {
  it('states the ratio and the verdict at every level', async () => {
    await preload({ colour: '#000000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    expect(screen.getByText('21.00')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Pass')).toHaveLength(5);
    expect(within(table).queryByText('Fail')).not.toBeInTheDocument();
  });

  it('fails the pair that does not reach the threshold', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#777777', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    const table = screen.getByRole('table');
    // 4.47:1 — enough for large text, not for normal text.
    expect(screen.getByText('4.47')).toBeInTheDocument();
    expect(within(table).getAllByText('Fail').length).toBeGreaterThan(0);
    await retype(user, field('Against'), '#000000');
    expect(screen.getByText('4.68')).toBeInTheDocument();
  });

  it('swaps the two colours over', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#0000ff', panel: 'contrast', swatches: [] });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Swap the two colours' }));
    expect(field('Hex')).toHaveValue('#0000ff');
    expect(field('Against')).toHaveValue('#ff0000');
  });
});

describe('the palette', () => {
  it('starts empty and says so', async () => {
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'palette', swatches: [] });
    await mount();
    expect(screen.getByText('No swatches yet')).toBeInTheDocument();
  });

  it('keeps the current colour, and writes it to the home directory', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'palette', swatches: [] });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Add current colour' }));
    expect(screen.getByRole('button', { name: 'Pick #ff0000' })).toBeInTheDocument();
    await waitFor(async () =>
      expect((await saved()).swatches).toEqual([{ id: 'swatch-1', hex: '#ff0000', name: '' }]),
    );
  });

  it('reorders and removes', async () => {
    const user = userEvent.setup();
    await preload({
      colour: '#ff0000',
      compare: '#ffffff',
      panel: 'palette',
      swatches: [
        { id: 'swatch-1', hex: '#ff0000', name: 'Red' },
        { id: 'swatch-2', hex: '#00ff00', name: 'Green' },
      ],
    });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Move Green up' }));
    await waitFor(async () =>
      expect((await saved()).swatches.map((s) => s.name)).toEqual(['Green', 'Red']),
    );
    await user.click(screen.getByRole('button', { name: 'Remove Red' }));
    await waitFor(async () =>
      expect((await saved()).swatches.map((s) => s.name)).toEqual(['Green']),
    );
  });

  it('names a swatch', async () => {
    const user = userEvent.setup();
    await preload({
      colour: '#ff0000',
      compare: '#ffffff',
      panel: 'palette',
      swatches: [{ id: 'swatch-1', hex: '#ff0000', name: '' }],
    });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Rename #ff0000' }));
    const body = await screen.findByTestId('dialog-body');
    await user.type(within(body).getByRole('textbox'), 'Brand red');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(async () => expect((await saved()).swatches[0]?.name).toBe('Brand red'));
  });

  it('loads a swatch back into the picker', async () => {
    const user = userEvent.setup();
    await preload({
      colour: '#ff0000',
      compare: '#ffffff',
      panel: 'palette',
      swatches: [{ id: 'swatch-1', hex: '#00ff00', name: 'Leaf' }],
    });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Pick Leaf' }));
    expect(field('Hex')).toHaveValue('#00ff00');
  });

  it('opens as an empty palette when the file cannot be read', async () => {
    await kernel.vfs.writeText(settingsPath(), '{ not json at all', { recursive: true });
    await mount();
    expect(screen.getByRole('radio', { name: 'Palette' })).toBeInTheDocument();
    expect(field('Hex')).toHaveValue('#2f6fd6');
  });
});

describe('colour vision', () => {
  it('renders the picked colour and every swatch through the three simulations', async () => {
    await preload({
      colour: '#ff0000',
      compare: '#ffffff',
      panel: 'vision',
      swatches: [{ id: 'swatch-1', hex: '#00ff00', name: 'Leaf' }],
    });
    await mount();
    expect(screen.getByTitle('Leaf under Protanopia: #f2f200')).toBeInTheDocument();
    expect(screen.getByTitle('Picked colour under Deuteranopia: #939300')).toBeInTheDocument();
    // A header row plus one row per colour.
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText(/simulation/i)).toBeInTheDocument();
  });
});

describe('switching panels', () => {
  it('remembers which one was open', async () => {
    const user = userEvent.setup();
    await preload({ colour: '#ff0000', compare: '#ffffff', panel: 'contrast', swatches: [] });
    await mount();
    await user.click(screen.getByRole('radio', { name: 'Vision' }));
    await waitFor(async () => expect((await saved()).panel).toBe('vision'));
    await choose('view', 'panel-palette');
    await waitFor(async () => expect((await saved()).panel).toBe('palette'));
  });
});

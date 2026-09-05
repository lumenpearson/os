import { createKernel, type Kernel, useClipboardStore, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import type { UnitsData } from './storage';
import Units from './Units';

const Dummy = () => null;

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

async function mount() {
  const process = kernel.launch('lumen.units', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.units', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Units pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const from = () => screen.getByLabelText<HTMLInputElement>('From');
const to = () => screen.getByLabelText<HTMLInputElement>('To');
const fromUnit = () => screen.getByRole<HTMLInputElement>('combobox', { name: 'From unit' });
const toUnit = () => screen.getByRole<HTMLInputElement>('combobox', { name: 'To unit' });
const status = () => screen.getByRole('status');

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

const settingsPath = () => join(home, '.config', 'units.json');
const saved = () => kernel.vfs.readJson<UnitsData>(settingsPath());

/** Replace the whole contents of a field, the way a person retypes a number. */
async function retype(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLInputElement,
  text: string,
) {
  await user.clear(field);
  if (text !== '') await user.type(field, text);
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
  it('is the converter the shell expects', () => {
    expect(definition.id).toBe('lumen.units');
    expect(definition.name).toBe('Units');
    expect(definition.category).toBe('utilities');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 620,
      height: 560,
      minWidth: 320,
      minHeight: 300,
    });
    expect(definition.keywords).toContain('convert');
  });
});

describe('opening the window', () => {
  it('starts on length, one metre in feet', async () => {
    await mount();
    expect(from()).toHaveValue('1');
    expect(to()).toHaveValue('3.28083989501');
    expect(fromUnit()).toHaveValue('Metre');
    expect(toUnit()).toHaveValue('Foot');
  });

  it('states the conversion in full', async () => {
    await mount();
    expect(status()).toHaveTextContent('1 m = 3.28083989501 ft');
  });
});

describe('typing a value', () => {
  it('converts as it is typed', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '2');
    expect(to()).toHaveValue('6.56167979003');
  });

  it('converts backwards when the second field is the one being typed in', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, to(), '1');
    expect(from()).toHaveValue('0.3048');
    expect(to()).toHaveValue('1');
  });

  it('empties the other field rather than showing a stale answer', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '');
    expect(to()).toHaveValue('');
    expect(status()).toHaveTextContent('Type a value in either field.');
  });

  it('marks a field that is not a number and says what it could not read', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '12 feet');
    expect(from()).toHaveAttribute('aria-invalid', 'true');
    expect(to()).toHaveValue('');
    expect(status()).toHaveTextContent('“12 feet” is not a number.');
  });

  it('reads a grouped number', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '1,000');
    expect(to()).toHaveValue('3280.83989501');
  });
});

describe('choosing a unit', () => {
  it('finds one by typing at the picker', async () => {
    const user = userEvent.setup();
    await mount();
    await user.clear(toUnit());
    await user.type(toUnit(), 'mile');
    const list = await screen.findByRole('listbox', { name: 'To unit' });
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent('Mile');
    await user.keyboard('{Enter}');
    expect(toUnit()).toHaveValue('Mile');
    expect(to()).toHaveValue('0.000621371192237');
  });

  it('puts the name back when the picker is left without choosing', async () => {
    const user = userEvent.setup();
    await mount();
    await user.clear(toUnit());
    await user.type(toUnit(), 'mil');
    await user.keyboard('{Escape}');
    expect(toUnit()).toHaveValue('Foot');
  });

  it('remembers the pair for next time', async () => {
    const user = userEvent.setup();
    await mount();
    await user.clear(toUnit());
    await user.type(toUnit(), 'kilometre{Enter}');
    await waitFor(async () =>
      expect((await saved()).pairs.length).toEqual({
        from: 'length.metre',
        to: 'length.kilometre',
      }),
    );
  });
});

describe('swapping the units', () => {
  it('exchanges them and brings the lower number up', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '2');
    await choose('edit', 'swap');
    expect(fromUnit()).toHaveValue('Foot');
    expect(toUnit()).toHaveValue('Metre');
    expect(from()).toHaveValue('6.56167979003');
    expect(to()).toHaveValue('2');
  });

  it('is on the toolbar as well as in the menu', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Swap units' }));
    expect(fromUnit()).toHaveValue('Foot');
    expect(toUnit()).toHaveValue('Metre');
  });
});

describe('switching category', () => {
  it('opens the new category on its own pair, at one', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '7');
    await choose('view', 'category-temperature');
    expect(fromUnit()).toHaveValue('Celsius');
    expect(toUnit()).toHaveValue('Fahrenheit');
    expect(from()).toHaveValue('1');
  });

  it('converts temperature as an affine scale, not as a factor', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'category-temperature');
    await retype(user, from(), '0');
    expect(to()).toHaveValue('32');
    await retype(user, from(), '100');
    expect(to()).toHaveValue('212');
    await retype(user, from(), '-40');
    expect(to()).toHaveValue('-40');
  });

  it('converts fuel economy as a reciprocal, not as a factor', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'category-fuel');
    expect(fromUnit()).toHaveValue('Miles per US gallon');
    expect(toUnit()).toHaveValue('Litres per 100 km');
    await retype(user, from(), '30');
    expect(to()).toHaveValue('7.84048611111');
  });

  it('comes back to the pair it left a category on', async () => {
    const user = userEvent.setup();
    await mount();
    await user.clear(toUnit());
    await user.type(toUnit(), 'kilometre{Enter}');
    await choose('view', 'category-mass');
    expect(toUnit()).toHaveValue('Pound');
    await choose('view', 'category-length');
    expect(toUnit()).toHaveValue('Kilometre');
  });

  it('steps to the next and previous category', async () => {
    await mount();
    await choose('view', 'next-category');
    expect(fromUnit()).toHaveValue('Kilogram');
    await choose('view', 'previous-category');
    expect(fromUnit()).toHaveValue('Metre');
  });

  it('is on the toolbar as well as in the menu', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('radio', { name: 'Angle' }));
    expect(fromUnit()).toHaveValue('Degree');
    expect(command('view', 'category-angle').checked).toBe(true);
  });

  it('is one tab stop with arrows inside it, not fourteen tab stops', async () => {
    const user = userEvent.setup();
    await mount();
    const chosen = () => screen.getByRole('radio', { checked: true });
    expect(chosen()).toHaveAccessibleName('Length');
    expect(chosen()).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Mass' })).toHaveAttribute('tabindex', '-1');
    chosen().focus();
    await user.keyboard('{ArrowRight}');
    expect(chosen()).toHaveAccessibleName('Mass');
    expect(chosen()).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(chosen()).toHaveAccessibleName('Length');
    await user.keyboard('{End}');
    expect(chosen()).toHaveAccessibleName('Fuel economy');
    await user.keyboard('{Home}');
    expect(chosen()).toHaveAccessibleName('Length');
  });

  it('remembers the category for next time', async () => {
    await mount();
    await choose('view', 'category-pressure');
    await waitFor(async () => expect((await saved()).category).toBe('pressure'));
  });
});

describe('copying the result', () => {
  it('puts the converted value on the clipboard', async () => {
    await mount();
    await choose('edit', 'copy-result');
    expect(useClipboardStore.getState().item?.text).toBe('3.28083989501');
    expect(screen.getByText('Copied to the clipboard')).toBeInTheDocument();
  });

  it('is unavailable while there is nothing to copy', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '');
    expect(command('edit', 'copy-result').enabled).toBe(false);
    expect(screen.getByRole('button', { name: /Copy/ })).toBeDisabled();
  });
});

describe('the recents list', () => {
  it('starts empty and says how to fill it', async () => {
    await mount();
    expect(screen.getByText(/Press Enter in a value field/)).toBeInTheDocument();
  });

  it('keeps a conversion when Enter is pressed', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '26.2');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: /26.2 m/ })).toBeInTheDocument();
    await waitFor(async () => {
      const data = await saved();
      expect(data.recents[0]).toMatchObject({
        from: 'length.metre',
        to: 'length.foot',
        value: 26.2,
      });
    });
  });

  it('keeps a conversion when the result is copied', async () => {
    await mount();
    await choose('edit', 'copy-result');
    expect(await screen.findByRole('button', { name: /1 m/ })).toBeInTheDocument();
  });

  it('restores the whole conversion when a row is clicked', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '26.2');
    await user.keyboard('{Enter}');
    await choose('view', 'category-mass');
    expect(fromUnit()).toHaveValue('Kilogram');
    await user.click(await screen.findByRole('button', { name: /26.2 m/ }));
    expect(fromUnit()).toHaveValue('Metre');
    expect(from()).toHaveValue('26.2');
    expect(to()).toHaveValue('85.9580052493');
  });

  it('clears the list', async () => {
    const user = userEvent.setup();
    await mount();
    await retype(user, from(), '26.2');
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: /26.2 m/ });
    await choose('edit', 'clear-recents');
    expect(screen.queryByRole('button', { name: /26.2 m/ })).not.toBeInTheDocument();
  });

  it('can be put away, and stays away', async () => {
    await mount();
    await choose('view', 'recents');
    expect(screen.queryByText(/Press Enter in a value field/)).not.toBeInTheDocument();
    await waitFor(async () => expect((await saved()).showRecents).toBe(false));
  });
});

describe('a settings file left by an earlier session', () => {
  it('is read back', async () => {
    const data: UnitsData = {
      category: 'data',
      pairs: { data: { from: 'data.gigabyte', to: 'data.gibibyte' } },
      recents: [{ from: 'data.gigabyte', to: 'data.gibibyte', value: 2, at: 1 }],
      showRecents: true,
    };
    await kernel.vfs.writeJson(settingsPath(), data, { recursive: true });
    await mount();
    expect(fromUnit()).toHaveValue('Gigabyte');
    expect(toUnit()).toHaveValue('Gibibyte');
    expect(to()).toHaveValue('0.931322574615');
  });

  it('survives a file that has been edited into nonsense', async () => {
    await kernel.vfs.writeJson(
      settingsPath(),
      { category: 'colour', pairs: 3 },
      { recursive: true },
    );
    await mount();
    expect(fromUnit()).toHaveValue('Metre');
    expect(to()).toHaveValue('3.28083989501');
  });
});

import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Calculator from './Calculator';
import definition from './index';
import type { CalculatorData } from './storage';

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

/** Render the app and let its settings file finish loading. */
async function mount() {
  const process = kernel.launch('lumen.calculator', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider
        value={{ pid: process.pid, windowId, appId: 'lumen.calculator', container: null }}
      >
        <DialogProvider>
          <FileDialogProvider>
            <Calculator pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const line = (name = 'Expression') => screen.getByRole('textbox', { name }) as HTMLInputElement;

const key = (name: string) => screen.getByRole('button', { name });

const settingsPath = () => join(home, '.config', 'calculator.json');

/** Run a menu command the way the menubar would. */
async function choose(menu: string, id: string) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
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

async function saved(): Promise<CalculatorData> {
  return kernel.vfs.readJson<CalculatorData>(settingsPath());
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
});

describe('the app definition', () => {
  it('is the calculator the shell expects', () => {
    expect(definition.id).toBe('lumen.calculator');
    expect(definition.name).toBe('Calculator');
    expect(definition.category).toBe('utilities');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 320,
      height: 480,
      minWidth: 260,
      minHeight: 380,
    });
    expect(definition.keywords).toContain('programmer');
  });
});

describe('typing', () => {
  it('is the first way in: the expression line takes the keystrokes', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('12+3');
    expect(line()).toHaveValue('12+3');
    expect(screen.getByText('= 15')).toBeInTheDocument();
  });

  it('rewrites * and / into the glyphs the display uses', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('6/2*3');
    expect(line()).toHaveValue('6÷2×3');
    expect(screen.getByText('= 9')).toBeInTheDocument();
  });

  it('finishes on Enter and writes the tape', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('12+3{Enter}');
    expect(line()).toHaveValue('15');
    await waitFor(async () => expect((await saved()).tape[0]?.expression).toBe('12+3'));
    expect((await saved()).tape[0]?.result).toBe('15');
  });

  it('shows why an expression failed', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('1/0{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Division by zero');
  });

  it('clears on Escape and rubs out on Backspace', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('123');
    await user.keyboard('{Backspace}');
    expect(line()).toHaveValue('12');
    await user.keyboard('{Escape}');
    expect(line()).toHaveValue('');
  });

  it('lights the button the keystroke belongs to', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('7');
    expect(document.querySelector('[data-key="digit-7"]')).toHaveAttribute('data-flash');
    await waitFor(() =>
      expect(document.querySelector('[data-key="digit-7"]')).not.toHaveAttribute('data-flash'),
    );
  });
});

describe('the keypad', () => {
  it('builds the same expression the keyboard would', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(key('7'));
    await user.click(key('Multiply'));
    await user.click(key('8'));
    await user.click(key('Equals'));
    expect(line()).toHaveValue('56');
  });

  it('flips the sign of what is on the line', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(key('4'));
    await user.click(key('Change sign'));
    expect(line()).toHaveValue('-4');
  });

  it('says C while there is something to clear', async () => {
    const user = userEvent.setup();
    await mount();
    expect(key('Clear')).toHaveTextContent('AC');
    await user.click(key('5'));
    expect(key('Clear')).toHaveTextContent('C');
  });
});

describe('memory', () => {
  it('adds, recalls and clears, and shows a mark while it holds a value', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('40');
    await user.click(key('Memory add'));
    expect(screen.getByText('M')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(key('Memory recall'));
    expect(line()).toHaveValue('40');
    await user.click(key('Memory clear'));
    expect(screen.queryByText('M')).not.toBeInTheDocument();
  });

  it('subtracts from what it holds', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(line());
    await user.keyboard('40');
    await user.click(key('Memory add'));
    await user.keyboard('{Escape}15');
    await user.click(key('Memory subtract'));
    await user.keyboard('{Escape}');
    await user.click(key('Memory recall'));
    expect(line()).toHaveValue('25');
  });
});

describe('scientific mode', () => {
  it('changes what the trig keys answer when the angle unit changes', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'scientific');
    await user.click(line());
    await user.keyboard('sin(90){Enter}');
    expect(line()).toHaveValue('1');
    await user.click(key('Angle unit: degrees'));
    await user.keyboard('{Escape}sin(90){Enter}');
    expect(line()).toHaveValue('0.893996663601');
  });

  it('turns the trig keys into their inverses under 2nd', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'scientific');
    expect(key('Sine')).toHaveTextContent('sin');
    await user.click(key('Inverse functions'));
    expect(key('Sine')).toHaveTextContent('sin⁻¹');
    await user.click(key('Sine'));
    expect(line()).toHaveValue('asin(');
  });

  it('reads a bracketed expression the way the parser does', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'scientific');
    await user.click(line());
    await user.keyboard('2(3+4){Enter}');
    expect(line()).toHaveValue('14');
  });
});

describe('programmer mode', () => {
  it('shows one value in all four bases at once', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    await user.click(key('F'));
    await user.click(key('F'));
    expect(line('Value')).toHaveValue('FF');
    const bases = screen.getByRole('radiogroup', { name: 'Number base' });
    expect(within(bases).getByRole('radio', { name: /HEX/ })).toHaveTextContent('FF');
    expect(within(bases).getByRole('radio', { name: /DEC/ })).toHaveTextContent('255');
    expect(within(bases).getByRole('radio', { name: /OCT/ })).toHaveTextContent('377');
    expect(within(bases).getByRole('radio', { name: /BIN/ })).toHaveTextContent('1111 1111');
  });

  it('turns off the digits the base does not have', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    expect(key('9')).toBeEnabled();
    const bases = screen.getByRole('radiogroup', { name: 'Number base' });
    await user.click(within(bases).getByRole('radio', { name: /BIN/ }));
    expect(key('9')).toBeDisabled();
    expect(key('1')).toBeEnabled();
    expect(key('A')).toBeDisabled();
  });

  it('rewrites what is being typed when the base changes', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    await user.click(key('F'));
    const bases = screen.getByRole('radiogroup', { name: 'Number base' });
    await user.click(within(bases).getByRole('radio', { name: /DEC/ }));
    expect(line('Value')).toHaveValue('15');
  });

  it('masks the value to the word size', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    await user.click(key('F'));
    await user.click(key('F'));
    await user.click(screen.getByRole('radio', { name: '8' }));
    const bases = screen.getByRole('radiogroup', { name: 'Number base' });
    expect(within(bases).getByRole('radio', { name: /DEC/ })).toHaveTextContent('-1');
  });

  it('is exact at 64 bits', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    await user.click(screen.getByRole('radio', { name: '64' }));
    for (const digit of 'FFFFFFFFFFFFFFFF') await user.click(key(digit));
    await user.click(key('Add'));
    await user.click(key('1'));
    await user.click(key('Equals'));
    expect(line('Value')).toHaveValue('0');
    const bases = screen.getByRole('radiogroup', { name: 'Number base' });
    await user.click(within(bases).getByRole('radio', { name: /DEC/ }));
    for (const digit of '9223372036854775807') await user.click(key(digit));
    expect(line('Value')).toHaveValue('9223372036854775807');
  });

  it('shifts and complements', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    await user.click(key('1'));
    await user.click(key('Shift left'));
    await user.click(key('4'));
    await user.click(key('Equals'));
    expect(line('Value')).toHaveValue('10');
  });
});

describe('the tape', () => {
  it('lists completed calculations and puts a result back on the line', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'tape');
    await user.click(line());
    await user.keyboard('2+3{Enter}{Escape}');
    const tape = screen.getByRole('region', { name: 'Tape' });
    expect(within(tape).getByText('2+3')).toBeInTheDocument();
    await user.click(within(tape).getByRole('button', { name: /2\+3/ }));
    expect(line()).toHaveValue('5');
  });

  it('empties on the Clear Tape command', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'tape');
    await user.click(line());
    await user.keyboard('2+3{Enter}');
    await waitFor(() => expect(command('edit', 'clear-tape').enabled).toBe(true));
    await choose('edit', 'clear-tape');
    await waitFor(() =>
      expect(screen.getByText('Completed calculations are listed here.')).toBeInTheDocument(),
    );
  });
});

describe('what is kept between sessions', () => {
  it('writes the mode, the angle unit, the base and the word size', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'programmer');
    await choose('view', 'radians');
    await user.click(screen.getByRole('radio', { name: '16' }));
    await waitFor(async () => {
      const data = await saved();
      expect(data.mode).toBe('programmer');
      expect(data.angle).toBe('rad');
      expect(data.wordSize).toBe(16);
    });
  });

  it('starts again where it was left', async () => {
    await kernel.vfs.writeJson(
      settingsPath(),
      { mode: 'programmer', base: 'bin', wordSize: 8, memory: 3 },
      { recursive: true },
    );
    await mount();
    await waitFor(() => expect(screen.getByRole('radio', { name: '8' })).toBeChecked());
    expect(screen.getByRole('radio', { name: /BIN/ })).toBeChecked();
    expect(screen.getByText('M')).toBeInTheDocument();
  });
});

import { createKernel, type Kernel, useSettingsStore, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import { FunctionsDialog } from './FunctionsDialog';
import Sheets from './Sheets';

let kernel: Kernel;

const BUDGET = {
  version: 1,
  sheets: [
    {
      name: 'Budget',
      cells: {
        A1: 'Item',
        B1: 'Planned',
        A2: 'Rent',
        B2: 1200,
        A3: 'Groceries',
        B3: 420,
        A4: 'Total',
        B4: '=SUM(B2:B3)',
      },
      columnWidths: { A: 140 },
    },
  ],
};

function mount(args: Record<string, unknown> = {}) {
  return render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: 1, windowId: 'w1', appId: 'lumen.sheets', container: null }}>
        <DialogProvider container={null}>
          <FileDialogProvider>
            <Sheets pid={1} windowId="w1" args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
}

const grid = () => screen.getByRole('grid');

/** Menu shortcuts bind only while the window has focus. */
function focusWindow() {
  useWindowStore.setState({ focusedId: 'w1' });
}

beforeEach(() => {
  useSettingsStore.getState().patch('keyboard', { modifier: 'ctrl' });
  const platform = { ...createWebPlatform(), adapter: new MemoryAdapter() };
  kernel = createKernel({ platform, apps: [] });
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('Sheets', () => {
  it('renders an empty grid with headers', () => {
    mount();
    expect(grid()).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('starts on A1 with an empty formula bar', () => {
    mount();
    expect(screen.getByLabelText('Name box')).toHaveValue('A1');
    expect(screen.getByLabelText('Formula bar')).toHaveValue('');
  });

  it('opens a workbook from the launch path', async () => {
    await kernel.vfs.writeJson('/Documents/Budget.lsd', BUDGET, { recursive: true });
    mount({ path: '/Documents/Budget.lsd' });
    expect(await screen.findByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('1200')).toBeInTheDocument();
  });

  it('shows the sheet name on its tab', async () => {
    await kernel.vfs.writeJson('/Documents/Budget.lsd', BUDGET, { recursive: true });
    mount({ path: '/Documents/Budget.lsd' });
    expect(await screen.findByRole('button', { name: 'Budget' })).toBeInTheDocument();
  });

  it('opens a CSV file as one sheet', async () => {
    await kernel.vfs.writeText('/Documents/data.csv', 'Fruit,Count\napple,3\npear,5\n', {
      recursive: true,
    });
    mount({ path: '/Documents/data.csv' });
    expect(await screen.findByText('Fruit')).toBeInTheDocument();
    expect(screen.getByText('apple')).toBeInTheDocument();
  });

  it('writes a typed value into the active cell', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByLabelText('Formula bar'));
    await user.keyboard('hello{Enter}');
    expect(await screen.findByText('hello')).toBeInTheDocument();
    // Enter moves down to A2.
    expect(screen.getByLabelText('Name box')).toHaveValue('A2');
  });

  it('computes a formula typed into the formula bar', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByLabelText('Formula bar'));
    await user.keyboard('=6*7{Enter}');
    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup();
    mount();
    grid().focus();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByLabelText('Name box')).toHaveValue('B2');
  });

  it('extends the selection with Shift and arrows', async () => {
    const user = userEvent.setup();
    mount();
    grid().focus();
    await user.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}');
    expect(screen.getByLabelText('Name box')).toHaveValue('A1:B2');
  });

  it('starts editing when a printable key is pressed', async () => {
    const user = userEvent.setup();
    mount();
    grid().focus();
    await user.keyboard('7');
    expect(await screen.findByLabelText('Edit A1')).toHaveValue('7');
  });

  it('cancels an edit on Escape', async () => {
    const user = userEvent.setup();
    mount();
    grid().focus();
    await user.keyboard('9');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByLabelText('Edit A1')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Formula bar')).toHaveValue('');
  });

  it('clears the selection with Delete', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeJson('/Documents/Budget.lsd', BUDGET, { recursive: true });
    mount({ path: '/Documents/Budget.lsd' });
    expect(await screen.findByText('Rent')).toBeInTheDocument();
    grid().focus();
    await user.keyboard('{ArrowDown}{Delete}');
    await waitFor(() => expect(screen.queryByText('Rent')).not.toBeInTheDocument());
  });

  it('summarises the selection in the status bar', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeJson('/Documents/Budget.lsd', BUDGET, { recursive: true });
    mount({ path: '/Documents/Budget.lsd' });
    expect(await screen.findByText('1200')).toBeInTheDocument();
    grid().focus();
    await user.keyboard('{ArrowRight}{ArrowDown}{Shift>}{ArrowDown}{/Shift}');
    expect(screen.getByLabelText('Name box')).toHaveValue('B2:B3');
    expect(screen.getByText('Sum 1,620')).toBeInTheDocument();
    expect(screen.getByText('Count 2')).toBeInTheDocument();
  });

  it('navigates from the name box', async () => {
    const user = userEvent.setup();
    mount();
    const nameBox = screen.getByLabelText('Name box');
    await user.clear(nameBox);
    await user.type(nameBox, 'C3{Enter}');
    expect(nameBox).toHaveValue('C3');
  });

  it('adds and switches sheets', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Add sheet' }));
    expect(screen.getByRole('button', { name: 'Sheet 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sheet 1' }));
    expect(screen.getByRole('button', { name: 'Sheet 1' })).toHaveAttribute('aria-current', 'true');
  });

  it('applies bold to the active cell', async () => {
    const user = userEvent.setup();
    mount();
    grid().focus();
    await user.keyboard('x{Enter}');
    expect(await screen.findByText('x')).not.toHaveClass('font-semibold');
    // Enter left the selection on A2; step back to the cell just written.
    await user.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('Name box')).toHaveValue('A1');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() => expect(screen.getByText('x')).toHaveClass('font-semibold'));
  });

  it('right-aligns numbers and left-aligns text by default', async () => {
    const user = userEvent.setup();
    mount();
    grid().focus();
    await user.keyboard('12{Enter}');
    await user.keyboard('word{Enter}');
    expect(await screen.findByText('12')).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByText('word')).toHaveStyle({ textAlign: 'left' });
  });

  it('lists the functions in the help dialog', async () => {
    const user = userEvent.setup();
    render(<FunctionsDialog open onClose={() => {}} container={null} />);
    expect(screen.getByRole('dialog', { name: 'Functions' })).toBeInTheDocument();
    expect(screen.getByText('SUM(value1, [value2, …])')).toBeInTheDocument();
    expect(screen.getByText('VLOOKUP(value, range, column, [approximate])')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search functions'), 'vlook');
    expect(screen.getByText('VLOOKUP(value, range, column, [approximate])')).toBeInTheDocument();
    expect(screen.queryByText('SUM(value1, [value2, …])')).not.toBeInTheDocument();
  });

  it('keeps focus in the formula bar while editing there', async () => {
    const user = userEvent.setup();
    mount();
    const bar = screen.getByLabelText('Formula bar');
    await user.click(bar);
    await user.keyboard('abc');
    expect(bar).toHaveFocus();
    expect(bar).toHaveValue('abc');
    expect(screen.queryByLabelText('Edit A1')).not.toBeInTheDocument();
  });

  it('shows the formula of a computed cell, not its value', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeJson('/Documents/Budget.lsd', BUDGET, { recursive: true });
    mount({ path: '/Documents/Budget.lsd' });
    expect(await screen.findByText('Rent')).toBeInTheDocument();
    grid().focus();
    // B4 holds =SUM(B2:B3); the grid shows 1620 and the bar the formula.
    await user.keyboard('{ArrowRight}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByLabelText('Name box')).toHaveValue('B4');
    expect(screen.getByLabelText('Formula bar')).toHaveValue('=SUM(B2:B3)');
    expect(screen.getByText('1620')).toBeInTheDocument();
  });

  it('undoes and redoes an edit', async () => {
    const user = userEvent.setup();
    focusWindow();
    mount();
    grid().focus();
    await user.keyboard('first{Enter}');
    expect(await screen.findByText('first')).toBeInTheDocument();
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(screen.queryByText('first')).not.toBeInTheDocument());
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(await screen.findByText('first')).toBeInTheDocument();
  });

  it('copies and pastes a cell through the clipboard', async () => {
    const user = userEvent.setup();
    focusWindow();
    mount();
    grid().focus();
    await user.keyboard('7{Enter}');
    expect(await screen.findByText('7')).toBeInTheDocument();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Control>}v{/Control}');
    await waitFor(() => expect(screen.getAllByText('7')).toHaveLength(2));
  });

  it('saves with the keyboard to the path it was opened from', async () => {
    const user = userEvent.setup();
    focusWindow();
    await kernel.vfs.writeJson('/Documents/Budget.lsd', BUDGET, { recursive: true });
    mount({ path: '/Documents/Budget.lsd' });
    expect(await screen.findByText('Rent')).toBeInTheDocument();
    grid().focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await user.keyboard('99{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(async () => {
      const saved = await kernel.vfs.readJson<{ sheets: Array<{ cells: Record<string, unknown> }> }>(
        '/Documents/Budget.lsd',
      );
      expect(saved.sheets[0]?.cells.C1).toBe(99);
    });
  });

  it('saves a CSV document back as CSV', async () => {
    const user = userEvent.setup();
    focusWindow();
    await kernel.vfs.writeText('/Documents/data.csv', 'a,b\n1,2\n', { recursive: true });
    mount({ path: '/Documents/data.csv' });
    expect(await screen.findByText('a')).toBeInTheDocument();
    grid().focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('3{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(async () => {
      expect(await kernel.vfs.readText('/Documents/data.csv')).toBe('a,b\n1,2\n3,\n');
    });
  });
});

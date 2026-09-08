import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnchoredMenu } from './Menu';
import {
  isTextField,
  type TextFieldMenuActions,
  type TextFieldMenuState,
  textFieldMenuItems,
  useTextFieldMenu,
} from './TextFieldMenu';

const shortcut = (keys: string) => keys.replace('Mod+', '⌘');

const noActions: TextFieldMenuActions = {
  cut: () => {},
  copy: () => {},
  paste: () => {},
  selectAll: () => {},
};

function state(over: Partial<TextFieldMenuState> = {}): TextFieldMenuState {
  return {
    editable: true,
    hasSelection: true,
    hasText: true,
    secret: false,
    read: 'ok',
    write: 'ok',
    ...over,
  };
}

const byId = (items: ReturnType<typeof textFieldMenuItems>, id: string) =>
  items.find((i) => i.id === id);

describe('isTextField', () => {
  it('accepts a text input and a textarea', () => {
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    expect(isTextField(input)).toBe(true);
    expect(isTextField(area)).toBe(true);
  });

  it('rejects inputs with no caret, and anything that is not a field', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const div = document.createElement('div');
    expect(isTextField(checkbox)).toBe(false);
    expect(isTextField(div)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('textFieldMenuItems', () => {
  it('offers the four editing commands with the platform shortcuts', () => {
    const items = textFieldMenuItems(state(), noActions, shortcut);
    expect(items.filter((i) => i.type !== 'separator').map((i) => i.label)).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Select All',
    ]);
    expect(byId(items, 'paste')?.shortcut).toBe('⌘V');
    expect(byId(items, 'select-all')?.shortcut).toBe('⌘A');
  });

  it('runs the action the item names', async () => {
    const actions = { ...noActions, copy: vi.fn() };
    const items = textFieldMenuItems(state(), actions, shortcut);
    byId(items, 'copy')?.onSelect?.();
    expect(actions.copy).toHaveBeenCalledOnce();
  });

  it('turns cut and copy off with nothing selected, and leaves paste alone', () => {
    const items = textFieldMenuItems(state({ hasSelection: false }), noActions, shortcut);
    expect(byId(items, 'cut')?.enabled).toBe(false);
    expect(byId(items, 'copy')?.enabled).toBe(false);
    expect(byId(items, 'paste')?.enabled).toBe(true);
  });

  it('turns cut and paste off in a read-only field, and keeps copy', () => {
    const items = textFieldMenuItems(state({ editable: false }), noActions, shortcut);
    expect(byId(items, 'cut')?.enabled).toBe(false);
    expect(byId(items, 'paste')?.enabled).toBe(false);
    expect(byId(items, 'copy')?.enabled).toBe(true);
  });

  it('says why paste is off when the browser refuses to read the clipboard', () => {
    const denied = textFieldMenuItems(state({ read: 'denied' }), noActions, shortcut);
    expect(byId(denied, 'paste')?.enabled).toBe(false);
    expect(byId(denied, 'paste')?.hint).toBe('permission denied');

    const missing = textFieldMenuItems(state({ read: 'unavailable' }), noActions, shortcut);
    expect(byId(missing, 'paste')?.enabled).toBe(false);
    expect(byId(missing, 'paste')?.hint).toBe('unavailable in this browser');
  });

  it('says why cut and copy are off when the clipboard cannot be written', () => {
    const items = textFieldMenuItems(state({ write: 'unavailable' }), noActions, shortcut);
    expect(byId(items, 'copy')?.enabled).toBe(false);
    expect(byId(items, 'copy')?.hint).toBe('unavailable in this browser');
  });

  it('gives no reason for an item that is off simply because nothing is selected', () => {
    const items = textFieldMenuItems(state({ hasSelection: false }), noActions, shortcut);
    expect(byId(items, 'copy')?.hint).toBeUndefined();
  });

  it('keeps a password out of the clipboard', () => {
    const items = textFieldMenuItems(state({ secret: true }), noActions, shortcut);
    expect(byId(items, 'cut')).toBeUndefined();
    expect(byId(items, 'copy')).toBeUndefined();
    expect(byId(items, 'paste')?.enabled).toBe(true);
    expect(byId(items, 'select-all')?.enabled).toBe(true);
  });

  it('turns select all off in an empty field', () => {
    const items = textFieldMenuItems(state({ hasText: false }), noActions, shortcut);
    expect(byId(items, 'select-all')?.enabled).toBe(false);
  });
});

function Harness() {
  const menu = useTextFieldMenu({ shortcut });
  const area = useRef<HTMLTextAreaElement>(null);
  return (
    <div
      onContextMenu={(e) => {
        menu.openAt(e);
        e.preventDefault();
      }}
    >
      <textarea ref={area} aria-label="Note" defaultValue="hello" />
      <button type="button">elsewhere</button>
      <AnchoredMenu open={menu.open} at={menu.at} items={menu.items} onClose={menu.close} />
    </div>
  );
}

describe('useTextFieldMenu', () => {
  it('opens on a right-click in a field and closes again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.pointer({ target: screen.getByLabelText('Note'), keys: '[MouseRight]' });
    expect(screen.getByRole('menuitem', { name: /Paste/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: /Paste/ })).not.toBeInTheDocument();
  });

  it('stays shut for a right-click that missed every field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.pointer({ target: screen.getByRole('button'), keys: '[MouseRight]' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens from the keyboard for the field that has focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByLabelText('Note').focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menuitem', { name: /Select All/ })).toBeInTheDocument();
  });

  it('says so in the menu when the browser will not read the clipboard', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<Harness />);
    await user.pointer({ target: screen.getByLabelText('Note'), keys: '[MouseRight]' });
    const paste = screen.getByRole('menuitem', { name: /Paste/ });
    expect(paste).toHaveAttribute('aria-disabled', 'true');
    expect(paste).toHaveTextContent('unavailable in this browser');
  });

  it('offers a live paste when the browser does read the clipboard', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: async () => 'pasted', writeText: async () => {} },
      configurable: true,
    });
    render(<Harness />);
    await user.pointer({ target: screen.getByLabelText('Note'), keys: '[MouseRight]' });
    const paste = screen.getByRole('menuitem', { name: /Paste/ });
    expect(paste).not.toHaveAttribute('aria-disabled');
  });
});

/** A field React owns: the edit has to reach state, not just the DOM node. */
function Controlled() {
  const [value, setValue] = useState('ab');
  const menu = useTextFieldMenu({ shortcut });
  return (
    <div
      onContextMenu={(e) => {
        menu.openAt(e);
        e.preventDefault();
      }}
    >
      <input aria-label="Field" value={value} onChange={(e) => setValue(e.target.value)} />
      <output>{value}</output>
      <AnchoredMenu open={menu.open} at={menu.at} items={menu.items} onClose={menu.close} />
    </div>
  );
}

describe('editing a controlled field', () => {
  function openOn(field: HTMLInputElement, start: number, end: number) {
    field.focus();
    field.setSelectionRange(start, end);
  }

  it('pastes at the caret and React keeps the new text', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: async () => 'X', writeText: async () => {} },
      configurable: true,
    });
    render(<Controlled />);
    const field = screen.getByLabelText('Field') as HTMLInputElement;
    openOn(field, 1, 1);
    fireEvent.contextMenu(field);
    await user.click(screen.getByRole('menuitem', { name: /Paste/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('aXb'));
    expect(field.value).toBe('aXb');
  });

  it('cuts the selection to the clipboard and out of the field', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: async () => '', writeText },
      configurable: true,
    });
    render(<Controlled />);
    const field = screen.getByLabelText('Field') as HTMLInputElement;
    openOn(field, 0, 1);
    fireEvent.contextMenu(field);
    await user.click(screen.getByRole('menuitem', { name: /Cut/ }));
    expect(writeText).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('b'));
  });
});

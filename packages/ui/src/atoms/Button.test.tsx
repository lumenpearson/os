import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cx } from '../cx';
import { MenuList } from '../molecules/Menu';
import { Button } from './Button';
import { Switch } from './Toggle';

describe('ui atoms', () => {
  it('cx joins conditionally', () => {
    expect(cx('a', null, false, ['b', { c: true, d: false }], undefined)).toBe('a b c');
  });

  it('button renders and fires', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('switch is a real checkbox with role switch', async () => {
    const onChange = vi.fn();
    render(<Switch label="Dark mode" checked={false} onChange={onChange} />);
    const input = screen.getByRole('switch', { name: 'Dark mode' });
    await userEvent.click(input);
    expect(onChange).toHaveBeenCalled();
  });

  it('menu supports keyboard navigation and selection', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <MenuList
        onClose={onClose}
        items={[
          { label: 'New', onSelect },
          { type: 'separator' },
          { label: 'Disabled', enabled: false },
          { label: 'Quit' },
        ]}
      />,
    );
    const menu = screen.getByRole('menu');
    expect(document.activeElement).toBe(menu);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'New' }).dataset.active).toBe('true');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Quit' }).dataset.active).toBe('true');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

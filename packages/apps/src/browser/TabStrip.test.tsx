import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type TabMenuActions, TabStrip, tabMenuItems } from './TabStrip';
import { createTab, type Tab } from './tabs';

const tabs: Tab[] = [
  createTab('a', 'https://one.example'),
  createTab('b', 'https://two.example'),
  createTab('c', 'https://three.example'),
];

function actions(over: Partial<TabMenuActions> = {}): TabMenuActions {
  return { newTab: () => {}, close: () => {}, ...over };
}

const labels = (items: ReturnType<typeof tabMenuItems>) =>
  items.filter((i) => i.type !== 'separator').map((i) => i.label);
const byId = (items: ReturnType<typeof tabMenuItems>, id: string) => items.find((i) => i.id === id);

describe('tabMenuItems', () => {
  it('offers the tab commands, and duplicate only when the caller can do it', () => {
    expect(labels(tabMenuItems(tabs, 'b', actions()))).toEqual([
      'New Tab',
      'Close Tab',
      'Close Other Tabs',
      'Close Tabs to the Right',
    ]);
    const withDuplicate = tabMenuItems(tabs, 'b', actions({ duplicate: () => {} }));
    expect(labels(withDuplicate)).toContain('Duplicate Tab');
  });

  it('duplicates the tab the menu was opened on', () => {
    const duplicate = vi.fn();
    byId(tabMenuItems(tabs, 'b', actions({ duplicate })), 'duplicate')?.onSelect?.();
    expect(duplicate).toHaveBeenCalledWith('b');
  });

  it('closes only the tab the menu was opened on', () => {
    const close = vi.fn();
    byId(tabMenuItems(tabs, 'b', actions({ close })), 'close')?.onSelect?.();
    expect(close.mock.calls).toEqual([['b']]);
  });

  it('closes every other tab, keeping the one the menu belongs to', () => {
    const close = vi.fn();
    byId(tabMenuItems(tabs, 'b', actions({ close })), 'close-others')?.onSelect?.();
    expect(close.mock.calls).toEqual([['a'], ['c']]);
  });

  it('closes the tabs after this one and none before it', () => {
    const close = vi.fn();
    byId(tabMenuItems(tabs, 'a', actions({ close })), 'close-right')?.onSelect?.();
    expect(close.mock.calls).toEqual([['b'], ['c']]);
  });

  it('turns off the two bulk commands when they would close nothing', () => {
    const one = tabMenuItems(tabs.slice(0, 1), 'a', actions());
    expect(byId(one, 'close-others')?.enabled).toBe(false);
    expect(byId(one, 'close-right')?.enabled).toBe(false);
    const last = tabMenuItems(tabs, 'c', actions());
    expect(byId(last, 'close-others')?.enabled).toBe(true);
    expect(byId(last, 'close-right')?.enabled).toBe(false);
  });
});

describe('TabStrip', () => {
  const strip = (over: Partial<React.ComponentProps<typeof TabStrip>> = {}) => (
    <TabStrip
      tabs={tabs}
      activeId="a"
      onSelect={() => {}}
      onClose={() => {}}
      onNew={() => {}}
      {...over}
    />
  );

  it('opens the menu on a right-click and acts on the tab it was opened on', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(strip({ onClose }));
    fireEvent.contextMenu(screen.getAllByRole('tab')[1] as HTMLElement);
    await user.click(screen.getByRole('menuitem', { name: 'Close Other Tabs' }));
    expect(onClose.mock.calls).toEqual([['a'], ['c']]);
  });

  it('opens the same menu from the keyboard', async () => {
    const user = userEvent.setup();
    render(strip());
    (screen.getAllByRole('tab')[0] as HTMLElement).focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menuitem', { name: 'Close Tabs to the Right' })).toBeInTheDocument();
  });
});

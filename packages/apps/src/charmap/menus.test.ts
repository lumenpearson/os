import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { describe, expect, it, vi } from 'vitest';
import { buildCharmapMenus, type CharmapMenuActions, type CharmapMenuState } from './menus';

const state = (patch: Partial<CharmapMenuState> = {}): CharmapMenuState => ({
  hasCharacter: true,
  pinned: false,
  hasRecents: true,
  inBlock: true,
  showSidebar: true,
  ...patch,
});

function actions(): CharmapMenuActions {
  return {
    close: vi.fn(),
    copyCharacter: vi.fn(),
    copyCodePoint: vi.fn(),
    copyHtml: vi.fn(),
    copyJavaScript: vi.fn(),
    copyCss: vi.fn(),
    togglePin: vi.fn(),
    clearRecents: vi.fn(),
    showPinned: vi.fn(),
    showRecent: vi.fn(),
    stepBlock: vi.fn(),
    focusSearch: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

describe('buildCharmapMenus', () => {
  it('offers the four menus a person looks for', () => {
    expect(buildCharmapMenus(state(), actions()).map((m) => m.id)).toEqual([
      'file',
      'edit',
      'go',
      'view',
    ]);
  });

  it('disables every copy command when there is no character', () => {
    const menus = buildCharmapMenus(state({ hasCharacter: false }), actions());
    for (const id of ['copy-character', 'copy-code-point', 'copy-html', 'copy-css', 'toggle-pin']) {
      expect(item(menus, 'edit', id).enabled, id).toBe(false);
    }
  });

  it('names the pin command after what it will do', () => {
    expect(item(buildCharmapMenus(state(), actions()), 'edit', 'toggle-pin').label).toBe(
      'Pin Character',
    );
    expect(
      item(buildCharmapMenus(state({ pinned: true }), actions()), 'edit', 'toggle-pin').label,
    ).toBe('Unpin Character');
  });

  it('leaves Clear Recents alone when there are none', () => {
    expect(
      item(buildCharmapMenus(state({ hasRecents: false }), actions()), 'edit', 'clear-recents')
        .enabled,
    ).toBe(false);
  });

  it('has no previous or next block outside a block', () => {
    const menus = buildCharmapMenus(state({ inBlock: false }), actions());
    expect(item(menus, 'go', 'previous-block').enabled).toBe(false);
    expect(item(menus, 'go', 'next-block').enabled).toBe(false);
  });

  it('steps the block in the direction its label promises', () => {
    const handlers = actions();
    const menus = buildCharmapMenus(state(), handlers);
    item(menus, 'go', 'previous-block').onSelect?.();
    expect(handlers.stepBlock).toHaveBeenCalledWith(-1);
    item(menus, 'go', 'next-block').onSelect?.();
    expect(handlers.stepBlock).toHaveBeenCalledWith(1);
  });

  it('shows the sidebar preference as a tick', () => {
    expect(item(buildCharmapMenus(state(), actions()), 'view', 'sidebar').checked).toBe(true);
    expect(
      item(buildCharmapMenus(state({ showSidebar: false }), actions()), 'view', 'sidebar').checked,
    ).toBe(false);
  });

  it('binds the shortcuts a person expects to find', () => {
    const menus = buildCharmapMenus(state(), actions());
    expect(item(menus, 'edit', 'copy-character').shortcut).toBe('Mod+C');
    expect(item(menus, 'edit', 'copy-code-point').shortcut).toBe('Shift+Mod+C');
    expect(item(menus, 'edit', 'toggle-pin').shortcut).toBe('Mod+D');
    expect(item(menus, 'go', 'find').shortcut).toBe('Mod+F');
    expect(item(menus, 'view', 'sidebar').shortcut).toBe('Mod+B');
  });

  it('wires each command to its own action', () => {
    const handlers = actions();
    const menus = buildCharmapMenus(state(), handlers);
    item(menus, 'file', 'close').onSelect?.();
    item(menus, 'edit', 'copy-character').onSelect?.();
    item(menus, 'go', 'go-pinned').onSelect?.();
    item(menus, 'view', 'sidebar').onSelect?.();
    expect(handlers.close).toHaveBeenCalledOnce();
    expect(handlers.copyCharacter).toHaveBeenCalledOnce();
    expect(handlers.showPinned).toHaveBeenCalledOnce();
    expect(handlers.toggleSidebar).toHaveBeenCalledOnce();
  });
});

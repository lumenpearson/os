import { describe, expect, it, vi } from 'vitest';
import { buildColourMenus, type ColourMenuActions, type ColourMenuState } from './menus';

function build(state: Partial<ColourMenuState> = {}) {
  const actions: ColourMenuActions = {
    close: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    addToPalette: vi.fn(),
    clearPalette: vi.fn(),
    swapWithComparison: vi.fn(),
    setPanel: vi.fn(),
  };
  const menus = buildColourMenus(
    { panel: 'contrast', hasSwatches: false, canPaste: false, ...state },
    actions,
  );
  const item = (menu: string, id: string) =>
    menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  return { menus, actions, item };
}

describe('the menubar', () => {
  it('offers File, Edit, Colour and View', () => {
    expect(build().menus.map((m) => m.id)).toEqual(['file', 'edit', 'colour', 'view']);
  });

  it('binds no chord twice', () => {
    const chords = build()
      .menus.flatMap((m) => m.items.flatMap((i) => [i, ...(i.submenu ?? [])]))
      .map((i) => i.shortcut)
      .filter((s): s is string => s !== undefined);
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('offers every notation under Copy As', () => {
    const submenu = build().item('edit', 'copy-as')?.submenu ?? [];
    expect(submenu.map((i) => i.id)).toEqual(['copy-hex', 'copy-rgb', 'copy-hsl', 'copy-oklch']);
  });

  it('turns Paste off when the clipboard holds nothing that is a colour', () => {
    expect(build({ canPaste: false }).item('edit', 'paste')?.enabled).toBe(false);
    expect(build({ canPaste: true }).item('edit', 'paste')?.enabled).toBe(true);
  });

  it('turns Remove All Swatches off on an empty palette', () => {
    expect(build({ hasSwatches: false }).item('colour', 'clear-palette')?.enabled).toBe(false);
    expect(build({ hasSwatches: true }).item('colour', 'clear-palette')?.enabled).toBe(true);
  });

  it('ticks the panel that is open', () => {
    const view = build({ panel: 'vision' }).menus.find((m) => m.id === 'view');
    expect(view?.items.filter((i) => i.checked).map((i) => i.id)).toEqual(['panel-vision']);
  });

  it('runs the action the caller passed', () => {
    const { actions, item } = build({ canPaste: true, hasSwatches: true });
    item('edit', 'copy-hex')?.onSelect?.();
    expect(actions.copy).toHaveBeenCalledWith('hex');
    item('colour', 'add-swatch')?.onSelect?.();
    expect(actions.addToPalette).toHaveBeenCalled();
    item('colour', 'swap')?.onSelect?.();
    expect(actions.swapWithComparison).toHaveBeenCalled();
    item('view', 'panel-palette')?.onSelect?.();
    expect(actions.setPanel).toHaveBeenCalledWith('palette');
    item('file', 'close')?.onSelect?.();
    expect(actions.close).toHaveBeenCalled();
  });
});

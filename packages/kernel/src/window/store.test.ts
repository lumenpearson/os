import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings/schema';
import { useSettingsStore } from '../settings/store';
import { snapRect } from './geometry';
import { useWindowStore } from './store';

const area = { x: 0, y: 26, width: 1280, height: 700 };

describe('window store', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, order: [], focusedId: null, nextZ: 100, area });
  });

  it('opens, focuses and orders windows', () => {
    const s = useWindowStore.getState();
    const a = s.open(1, 'x', { width: 600, height: 400 });
    const b = s.open(1, 'x', { width: 600, height: 400 });
    expect(useWindowStore.getState().focusedId).toBe(b.id);
    expect(useWindowStore.getState().order).toEqual([a.id, b.id]);
    useWindowStore.getState().focus(a.id);
    expect(useWindowStore.getState().order).toEqual([b.id, a.id]);
    expect(useWindowStore.getState().windows[a.id]?.zIndex).toBeGreaterThan(
      useWindowStore.getState().windows[b.id]?.zIndex ?? 0,
    );
  });

  it('closing the focused window focuses the next visible one', () => {
    const s = useWindowStore.getState();
    const a = s.open(1, 'x', { width: 600, height: 400 });
    const b = s.open(1, 'x', { width: 600, height: 400 });
    const c = s.open(1, 'x', { width: 600, height: 400 });
    useWindowStore.getState().minimize(b.id);
    useWindowStore.getState().close(c.id);
    expect(useWindowStore.getState().focusedId).toBe(a.id);
  });

  it('maximizes, restores, snaps and relayouts', () => {
    const s = useWindowStore.getState();
    const a = s.open(1, 'x', { width: 600, height: 400 });
    const original = useWindowStore.getState().windows[a.id]?.bounds;
    useWindowStore.getState().toggleMaximize(a.id);
    expect(useWindowStore.getState().windows[a.id]?.bounds).toEqual(area);
    useWindowStore.getState().toggleMaximize(a.id);
    expect(useWindowStore.getState().windows[a.id]?.bounds).toEqual(original);
    useWindowStore.getState().snap(a.id, 'left');
    expect(useWindowStore.getState().windows[a.id]?.bounds.width).toBe(640);
    useWindowStore.getState().setArea({ x: 0, y: 26, width: 800, height: 500 });
    expect(useWindowStore.getState().windows[a.id]?.bounds.width).toBe(400);
    useWindowStore.getState().snap(a.id, null);
    const restored = useWindowStore.getState().windows[a.id]?.bounds;
    expect(restored?.width).toBe(600);
    expect(restored?.x).toBeGreaterThanOrEqual(0);
  });

  it('cycles focus with focusNext', () => {
    const s = useWindowStore.getState();
    const a = s.open(1, 'x', { width: 600, height: 400 });
    const b = s.open(1, 'x', { width: 600, height: 400 });
    useWindowStore.getState().focusNext();
    expect(useWindowStore.getState().focusedId).toBe(a.id);
    useWindowStore.getState().focusNext();
    expect(useWindowStore.getState().focusedId).toBe(b.id);
  });
});

describe('showing the desktop and coming back', () => {
  it('gives focus back, so window shortcuts still work', () => {
    const s = useWindowStore.getState();
    s.open(1, 'lumen.files', { width: 600, height: 400 });
    s.open(1, 'lumen.editor', { width: 600, height: 400 });

    useWindowStore.getState().minimizeAll();
    expect(useWindowStore.getState().focusedId).toBeNull();

    useWindowStore.getState().restoreAll();

    const after = useWindowStore.getState();
    expect(Object.values(after.windows).every((w) => !w.minimized)).toBe(true);
    // Without this the menubar carries no menus and every window.* shortcut
    // short-circuits on the focused window being absent.
    expect(after.focusedId).toBe(after.order[after.order.length - 1]);
  });
});

describe('a work area that shrinks and grows again', () => {
  it('gives the window its size back rather than leaving it small', () => {
    const store = useWindowStore.getState();
    store.setArea({ x: 0, y: 0, width: 1280, height: 700 });
    const win = store.open(1, 'lumen.files', { width: 900, height: 600 });
    const id = win.id;
    useWindowStore.getState().setBounds(id, { x: 40, y: 40, width: 900, height: 600 });

    useWindowStore.getState().setArea({ x: 0, y: 0, width: 600, height: 400 });
    expect(useWindowStore.getState().windows[id]?.bounds.width).toBe(600);

    useWindowStore.getState().setArea({ x: 0, y: 0, width: 1280, height: 700 });

    const back = useWindowStore.getState().windows[id]?.bounds;
    expect(back?.width).toBe(900);
    expect(back?.height).toBe(600);
  });
});

describe('the tiling gap', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, order: [], focusedId: null, nextZ: 100, area });
    useSettingsStore.setState({ settings: defaultSettings() });
  });

  it('tiles flush to the edges at the default of 0', () => {
    const w = useWindowStore.getState().open(1, 'x', { width: 600, height: 400 });
    useWindowStore.getState().snap(w.id, 'left');
    expect(useWindowStore.getState().windows[w.id]?.bounds).toEqual(snapRect('left', area));
  });

  it('reads the setting when a window is tiled', () => {
    useSettingsStore.getState().patch('windows', { tilingGap: 12 });
    const w = useWindowStore.getState().open(1, 'x', { width: 600, height: 400 });
    useWindowStore.getState().snap(w.id, 'left');
    expect(useWindowStore.getState().windows[w.id]?.bounds).toEqual(snapRect('left', area, 12));
  });

  it('keeps the gap when the work area changes under a tiled window', () => {
    useSettingsStore.getState().patch('windows', { tilingGap: 8 });
    const w = useWindowStore.getState().open(1, 'x', { width: 600, height: 400 });
    useWindowStore.getState().snap(w.id, 'right');
    const smaller = { x: 0, y: 26, width: 900, height: 500 };
    useWindowStore.getState().setArea(smaller);
    expect(useWindowStore.getState().windows[w.id]?.bounds).toEqual(snapRect('right', smaller, 8));
  });
});

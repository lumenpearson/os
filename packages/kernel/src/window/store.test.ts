import { beforeEach, describe, expect, it } from 'vitest';
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

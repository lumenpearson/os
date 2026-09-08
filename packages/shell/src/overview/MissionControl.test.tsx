import { useWindowStore, type WindowState } from '@lumen/kernel';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useShellStore } from '../shellStore';
import { MissionControl } from './MissionControl';

/**
 * A window as the store holds one. The cast is deliberate: the test only cares
 * about the id and the bounds the effect reads, and spelling out every field
 * of WindowState here would obscure that.
 */
function windowAt(x: number, y: number): WindowState {
  return {
    id: 'w1',
    pid: 1,
    appId: 'lumen.files',
    title: 'Files',
    bounds: { x, y, width: 400, height: 300 },
    restoreBounds: null,
    minimized: false,
    maximized: false,
    fullscreen: false,
    snap: null,
    zIndex: 100,
    options: {},
    dirty: false,
    documentPath: null,
    createdAt: 0,
    closing: false,
  } as unknown as WindowState;
}

function frame(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-window-id="w1"]');
  if (!el) throw new Error('no window frame in the layer');
  return el;
}

beforeEach(() => {
  document.body.innerHTML =
    '<div data-testid="window-layer"><section data-window-id="w1"></section></div>';
  useWindowStore.setState({
    windows: { w1: windowAt(10, 20) },
    order: ['w1'],
    focusedId: 'w1',
    area: { x: 0, y: 26, width: 1280, height: 700 },
  });
  useShellStore.setState({ missionControl: false });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('while Mission Control is closed', () => {
  it('leaves the window frames entirely alone', () => {
    render(<MissionControl />);

    // The frame's transform belongs to React's style prop and its transition to
    // its own classes. An inline transition here would make every drag ease.
    expect(frame().style.transform).toBe('');
    expect(frame().style.transition).toBe('');
    expect(frame().style.transformOrigin).toBe('');
  });

  it('still leaves them alone when a window moves', () => {
    const view = render(<MissionControl />);
    useWindowStore.setState({ windows: { w1: windowAt(300, 400) } });
    view.rerender(<MissionControl />);

    expect(frame().style.transform).toBe('');
    expect(frame().style.transition).toBe('');
  });
});

describe('while Mission Control is open', () => {
  it('places each window in the grid', () => {
    useShellStore.setState({ missionControl: true });
    render(<MissionControl />);

    expect(frame().style.transform).toMatch(/^translate3d\(.+\) scale\(.+\)$/);
    expect(frame().style.pointerEvents).toBe('none');
  });

  it('eases back to the real bounds on close and gives the pointer back', () => {
    useShellStore.setState({ missionControl: true });
    const view = render(<MissionControl />);
    useShellStore.setState({ missionControl: false });
    view.rerender(<MissionControl />);

    expect(frame().style.transform).toBe('translate3d(10px, 20px, 0)');
    expect(frame().style.pointerEvents).toBe('');

    // Once that transition finishes, every property it set is handed back.
    frame().dispatchEvent(new Event('transitionend'));
    expect(frame().style.transform).toBe('');
    expect(frame().style.transition).toBe('');
    expect(frame().style.transformOrigin).toBe('');
  });
});

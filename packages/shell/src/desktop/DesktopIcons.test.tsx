import { createKernel, type Kernel, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesktopIcons } from './DesktopIcons';

/**
 * The selection rectangle, driven the way a pointer drives it. happy-dom does
 * no layout, so the boxes the component measures are stubbed: the icon layer
 * sits at (8, 34) on the page and every icon keeps the position React gave it.
 */

/** Page position of the icon layer, so client coordinates convert to layer ones. */
const LAYER = { left: 8, top: 34 };
const ICON = { width: 96, height: 88 };

let kernel: Kernel;
let restoreRects: (() => void) | null = null;

function boxAt(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  };
}

function stubRects() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function measured(this: HTMLElement): DOMRect {
    if (this.dataset.testid === 'desktop-icons') return boxAt(LAYER.left, LAYER.top, 1264, 674);
    if (this.dataset.desktopPath) {
      const x = Number.parseFloat(this.style.left) || 0;
      const y = Number.parseFloat(this.style.top) || 0;
      return boxAt(LAYER.left + x, LAYER.top + y, ICON.width, ICON.height);
    }
    return boxAt(0, 0, 0, 0);
  };
  restoreRects = () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

const layer = () => screen.getByTestId('desktop-icons');
const marquee = () => screen.getByTestId('desktop-marquee');
const icon = (name: string) => screen.getByRole('option', { name });
const selection = () =>
  screen
    .getAllByRole('option')
    .filter((el) => el.getAttribute('aria-selected') === 'true')
    .map((el) => el.getAttribute('aria-label'));

/** Presses on empty desktop at a point in layer coordinates. */
function press(x: number, y: number, modifiers: { shiftKey?: boolean; metaKey?: boolean } = {}) {
  fireEvent.pointerDown(layer(), {
    button: 0,
    clientX: LAYER.left + x,
    clientY: LAYER.top + y,
    ...modifiers,
  });
}

/** Moves the pointer and lets the frame the component asked for run. */
async function moveTo(x: number, y: number) {
  await act(async () => {
    fireEvent.pointerMove(window, { clientX: LAYER.left + x, clientY: LAYER.top + y });
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

async function release(x: number, y: number) {
  await act(async () => {
    fireEvent.pointerUp(window, { clientX: LAYER.left + x, clientY: LAYER.top + y });
  });
}

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  const desktop = join(kernel.home, 'Desktop');
  await kernel.vfs.ensureDir(desktop);
  // A fresh home comes with a welcome file; the rows have to be predictable.
  for (const entry of await kernel.vfs.readDir(desktop)) {
    await kernel.vfs.remove(entry.path, { recursive: true });
  }
  for (const name of ['alpha.txt', 'beta.txt', 'gamma.txt']) {
    await kernel.vfs.writeText(join(desktop, name), name);
  }
  useWindowStore.getState().setArea({ x: 0, y: 26, width: 1280, height: 700 });
  stubRects();
});

afterEach(() => {
  restoreRects?.();
  restoreRects = null;
});

async function mount() {
  const view = render(
    <KernelProvider kernel={kernel}>
      <DialogProvider>
        <DesktopIcons />
      </DialogProvider>
    </KernelProvider>,
  );
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
  return view;
}

describe('the desktop selection rectangle', () => {
  it('lays the icons out in one column, so the rows are known', async () => {
    await mount();
    expect(icon('alpha.txt').style.top).toBe('0px');
    expect(icon('beta.txt').style.top).toBe('108px');
    expect(icon('gamma.txt').style.top).toBe('216px');
  });

  it('draws the rectangle the drag spans and selects what it touches', async () => {
    await mount();
    expect(marquee().hidden).toBe(true);

    press(10, 10);
    await moveTo(60, 150);

    const box = marquee();
    expect(box.hidden).toBe(false);
    expect(box.style.transform).toBe('translate(10px, 10px)');
    expect(box.style.width).toBe('50px');
    expect(box.style.height).toBe('140px');
    expect(selection()).toEqual(['alpha.txt', 'beta.txt']);

    await release(60, 150);
    expect(marquee().hidden).toBe(true);
    expect(selection()).toEqual(['alpha.txt', 'beta.txt']);
  });

  it('narrows the selection again when the rectangle shrinks back', async () => {
    await mount();
    press(10, 10);
    await moveTo(60, 150);
    expect(selection()).toEqual(['alpha.txt', 'beta.txt']);

    await moveTo(60, 60);
    expect(selection()).toEqual(['alpha.txt']);
    // The rows re-rendered around it; the rectangle is still on screen.
    expect(marquee().hidden).toBe(false);
    expect(marquee().style.height).toBe('50px');
  });

  it('spans the same rectangle when the drag goes up and to the left', async () => {
    await mount();
    press(60, 150);
    await moveTo(10, 10);

    expect(marquee().style.transform).toBe('translate(10px, 10px)');
    expect(marquee().style.width).toBe('50px');
    expect(selection()).toEqual(['alpha.txt', 'beta.txt']);
  });

  it('adds to the selection when Shift or Meta is held', async () => {
    await mount();
    press(10, 10);
    await moveTo(60, 60);
    await release(60, 60);
    expect(selection()).toEqual(['alpha.txt']);

    press(10, 200, { shiftKey: true });
    await moveTo(60, 260);
    expect(selection()).toEqual(['alpha.txt', 'gamma.txt']);
    await release(60, 260);

    press(10, 110, { metaKey: true });
    await moveTo(60, 150);
    expect(selection()).toEqual(['alpha.txt', 'beta.txt', 'gamma.txt']);
  });

  it('clears the selection on a press that never travels', async () => {
    await mount();
    press(10, 10);
    await moveTo(60, 60);
    await release(60, 60);
    expect(selection()).toEqual(['alpha.txt']);

    press(300, 300);
    await moveTo(302, 301);
    await release(302, 301);
    expect(selection()).toEqual([]);
    expect(marquee().hidden).toBe(true);
  });

  it('puts back the selection the drag started from when Escape cancels it', async () => {
    await mount();
    press(10, 10);
    await moveTo(60, 60);
    await release(60, 60);
    expect(selection()).toEqual(['alpha.txt']);

    press(10, 110);
    await moveTo(60, 150);
    expect(selection()).toEqual(['beta.txt']);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(selection()).toEqual(['alpha.txt']);
    expect(marquee().hidden).toBe(true);

    // The cancelled drag is over: further movement changes nothing.
    await moveTo(60, 300);
    expect(selection()).toEqual(['alpha.txt']);
  });

  it('does not draw a rectangle for a drag that starts on an icon', async () => {
    await mount();
    fireEvent.pointerDown(icon('beta.txt'), {
      button: 0,
      clientX: LAYER.left + 20,
      clientY: LAYER.top + 120,
    });
    await moveTo(200, 400);

    expect(marquee().hidden).toBe(true);
    expect(selection()).toEqual(['beta.txt']);
  });
});

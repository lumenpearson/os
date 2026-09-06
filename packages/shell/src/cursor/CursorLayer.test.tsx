/**
 * The layer's own tests. The shape table and the scrollbar rule are covered
 * next door; what is left here is the part that only shows up in a browser —
 * when the work is done. A pointer move must record and nothing more: the
 * shape lookup ends in `getComputedStyle`, which forces the browser to settle
 * style, and a pointer moving over the OS at 120 Hz would pay for that on
 * every event rather than on every frame.
 */

import { defaultSettings, useSettingsStore } from '@lumen/kernel';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CursorLayer } from './CursorLayer';

/** Frames the test runs by hand, so "before the frame" is a state it can be in. */
function heldFrames() {
  const queue: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    queue.push(callback);
    return queue.length;
  });
  return {
    run() {
      for (const callback of queue.splice(0)) callback(0);
    },
  };
}

function mount(hint?: string) {
  const frames = heldFrames();
  const { container } = render(<CursorLayer />);
  const target = document.createElement('div');
  if (hint) target.dataset.cursor = hint;
  container.append(target);
  return { frames, target };
}

const cursor = () => screen.getByTestId('os-cursor');

beforeEach(() => {
  useSettingsStore.setState({ settings: defaultSettings() });
});

describe('the shape under the pointer', () => {
  it('is read once for a frame, however many moves went into it', () => {
    const { frames, target } = mount();
    const computed = vi.spyOn(globalThis, 'getComputedStyle');

    for (let i = 0; i < 6; i += 1) fireEvent.pointerMove(target, { clientX: i, clientY: i });
    expect(computed).not.toHaveBeenCalled();

    frames.run();
    expect(computed).toHaveBeenCalledTimes(1);
  });

  it('is the one under the last move, not the first', () => {
    const { frames, target } = mount('grab');
    const other = document.createElement('div');
    other.dataset.cursor = 'text';
    target.after(other);

    fireEvent.pointerMove(target, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(other, { clientX: 20, clientY: 20 });
    frames.run();

    expect(cursor().dataset.shape).toBe('text');
  });

  it('follows the pointer in the same frame it takes the shape in', () => {
    const { frames, target } = mount('pointer');
    fireEvent.pointerMove(target, { clientX: 42, clientY: 24 });

    expect(cursor().dataset.shape).toBeUndefined();
    frames.run();

    expect(cursor().style.transform).toBe('translate3d(42px, 24px, 0)');
    expect(cursor().dataset.shape).toBe('pointer');
  });

  it('costs no style read at all when the element hints its cursor', () => {
    const { frames, target } = mount('grab');
    const computed = vi.spyOn(globalThis, 'getComputedStyle');

    fireEvent.pointerMove(target, { clientX: 5, clientY: 5 });
    frames.run();

    expect(computed).not.toHaveBeenCalled();
    expect(cursor().dataset.shape).toBe('grab');
  });

  it('survives a pointer move whose target is not an element', () => {
    /*
     * Firefox reports the document as the target of a move over the gap
     * outside the page, and `getComputedStyle` refuses anything that is not
     * an element. The layer used to cast `e.target` to Element without
     * checking and threw out of the handler — thirty-eight times in one
     * session on the deployed build.
     */
    const { frames } = mount();
    const computed = vi.spyOn(globalThis, 'getComputedStyle');

    expect(() => {
      fireEvent.pointerMove(document, { clientX: 7, clientY: 9 });
      frames.run();
    }).not.toThrow();

    expect(computed, 'the document is never handed to getComputedStyle').not.toHaveBeenCalledWith(
      document,
    );
    expect(cursor().dataset.shape).toBe('arrow');
    expect(cursor().style.transform).toBe('translate3d(7px, 9px, 0)');
  });

  it('draws the shape it is on, and only that one', () => {
    const { frames, target } = mount('grab');
    fireEvent.pointerMove(target, { clientX: 5, clientY: 5 });
    frames.run();

    const art = cursor().querySelector('[data-art]');
    // One drawing in the document rather than thirty-three: the layer swaps
    // the markup it needs when the shape changes, which is a handful of times
    // a minute and not on the pointer's path.
    expect(art?.querySelectorAll('svg')).toHaveLength(1);
    expect(art?.innerHTML).toContain('viewBox="0 0 32 32"');
    // The hand's palm is its point, and it is not the middle of the box.
    expect((art as HTMLElement).style.getPropertyValue('--lumen-cursor-hotspot')).toBe(
      'translate(-46.563%, -44.063%)',
    );
  });

  it('moves the drawing so its own point sits on the pointer', () => {
    const { frames, target } = mount();
    fireEvent.pointerMove(target, { clientX: 5, clientY: 5 });
    frames.run();
    const art = cursor().querySelector('[data-art]') as HTMLElement;
    // The arrow's tip is at (10, 7.5) of 32 — measured off the drawing, and
    // the same point the path it is drawn from starts at.
    expect(art.style.getPropertyValue('--lumen-cursor-hotspot')).toBe(
      'translate(-31.250%, -23.438%)',
    );
  });

  it('holds its last shape through a press, which reads nothing new', () => {
    const { frames, target } = mount('grab');
    fireEvent.pointerMove(target, { clientX: 5, clientY: 5 });
    frames.run();

    const computed = vi.spyOn(globalThis, 'getComputedStyle');
    fireEvent.pointerDown(target, { clientX: 5, clientY: 5 });
    frames.run();

    expect(computed).not.toHaveBeenCalled();
    expect(cursor().dataset.shape).toBe('grab');
    expect(cursor().dataset.pressed).toBe('true');
  });
});

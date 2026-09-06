/**
 * The surface's view gestures. The zoom and pan arithmetic is `transform.ts`
 * and tested there; what is left is the plumbing — that a wheel moves the
 * stage by writing its own box and tells React once the notches stop, the
 * same bargain a middle-button pan already makes with the pointer.
 *
 * happy-dom has no 2D context, so the canvases draw nothing here. That is the
 * point: nothing in this file is about pixels.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from './prefs';
import { Surface } from './Surface';
import { panBy, type View } from './transform';

/** Bigger than the viewport in both axes, so a pan has somewhere to go. */
const SIZE = { width: 2000, height: 2000 };
const VIEWPORT = { width: 800, height: 600 };
const START: View = { scale: 1, x: -100, y: -100 };

function mount(onView: (view: View) => void) {
  render(
    <Surface
      document={null}
      size={SIZE}
      view={START}
      viewport={VIEWPORT}
      tool="pencil"
      prefs={DEFAULT_PREFS}
      selection={null}
      revision={0}
      onView={onView}
      onSelection={() => {}}
      onCommit={() => {}}
      onPickColour={() => {}}
      onPlaceText={() => {}}
    />,
  );
  const host = screen.getByTestId('paint-surface');
  return { host, stage: host.firstElementChild as HTMLElement };
}

/** Run the frame the wheel asked for. */
function frame() {
  act(() => {
    vi.advanceTimersByTime(16);
  });
}

/** Long enough that the settle timer has had its say. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the wheel', () => {
  it('moves the stage without telling React, then tells it once', () => {
    const onView = vi.fn();
    const { host, stage } = mount(onView);

    fireEvent.wheel(host, { deltaY: 50 });
    fireEvent.wheel(host, { deltaY: 50 });
    frame();

    expect(onView).not.toHaveBeenCalled();
    expect(stage.style.top).toBe('-200px');
    expect(stage.style.left).toBe('-100px');

    settle();
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith({ scale: 1, x: -100, y: -200 });
  });

  it('compounds its notches, so the view it reports is where the stage is', () => {
    const onView = vi.fn();
    const { host } = mount(onView);

    for (let i = 0; i < 4; i += 1) fireEvent.wheel(host, { deltaX: 25 });
    settle();

    let byHand = START;
    for (let i = 0; i < 4; i += 1) byHand = panBy(byHand, -25, 0, SIZE, VIEWPORT);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(byHand);
  });

  it('hands the view over early when the pointer takes the surface', () => {
    const onView = vi.fn();
    const { host } = mount(onView);

    fireEvent.wheel(host, { deltaY: 50 });
    expect(onView).not.toHaveBeenCalled();

    fireEvent.pointerDown(host, { button: 0, clientX: 10, clientY: 10 });
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith({ scale: 1, x: -100, y: -150 });

    // The timer that would have reported it has nothing left to say.
    settle();
    expect(onView).toHaveBeenCalledTimes(1);
  });
});

describe('a middle-button pan', () => {
  it('says the image is being carried, and gives the tool its cursor back', () => {
    const { host } = mount(() => {});

    expect(host.dataset.cursor).toBe('crosshair');
    fireEvent.pointerDown(host, { button: 1, clientX: 10, clientY: 10 });
    expect(host.dataset.cursor).toBe('grabbing');

    fireEvent.pointerUp(window);
    expect(host.dataset.cursor).toBe('crosshair');
  });
});

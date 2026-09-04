import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaFrames } from './clock';

/**
 * Animation frames are driven by hand so a test can say exactly how many
 * paints happened.
 */
let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;

function flush(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
}

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function element(): HTMLMediaElement {
  return document.createElement('video');
}

describe('useMediaFrames', () => {
  it('paints once when it mounts, without a loop, while paused', () => {
    const media = element();
    const onFrame = vi.fn();
    renderHook(() => useMediaFrames(media, false, onFrame));

    flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(media);

    flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('paints again when the element says something changed', () => {
    const media = element();
    const onFrame = vi.fn();
    renderHook(() => useMediaFrames(media, false, onFrame));
    flush();

    media.dispatchEvent(new Event('timeupdate'));
    flush();
    expect(onFrame).toHaveBeenCalledTimes(2);

    media.dispatchEvent(new Event('seeked'));
    media.dispatchEvent(new Event('progress'));
    flush();
    expect(onFrame).toHaveBeenCalledTimes(3);
  });

  it('keeps painting every frame while playing', () => {
    const media = element();
    const onFrame = vi.fn();
    renderHook(() => useMediaFrames(media, true, onFrame));

    flush();
    const first = onFrame.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    flush();
    expect(onFrame.mock.calls.length).toBeGreaterThan(first);
  });

  it('stops the loop when the document is hidden and starts it again after', () => {
    const media = element();
    const onFrame = vi.fn();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    renderHook(() => useMediaFrames(media, true, onFrame));

    flush();
    onFrame.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    flush();
    expect(onFrame).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    flush();
    expect(onFrame).toHaveBeenCalled();
    hidden.mockRestore();
  });

  it('cancels its frames and listeners when it unmounts', () => {
    const media = element();
    const onFrame = vi.fn();
    const { unmount } = renderHook(() => useMediaFrames(media, true, onFrame));
    flush();
    onFrame.mockClear();

    unmount();
    expect(frames.size).toBe(0);

    media.dispatchEvent(new Event('timeupdate'));
    flush();
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('does nothing without an element', () => {
    const onFrame = vi.fn();
    renderHook(() => useMediaFrames(null, true, onFrame));
    flush();
    expect(onFrame).not.toHaveBeenCalled();
  });
});

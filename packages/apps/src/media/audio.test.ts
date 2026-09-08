import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioGraph } from './audio';

/** What `resume()` should leave the context in, per test. */
let resumesTo: 'running' | 'suspended' = 'running';

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAnalyser extends FakeNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
}

class FakeContext {
  static made: FakeContext[] = [];
  state: string = 'suspended';
  destination = new FakeNode();
  source = new FakeNode();
  analyser = new FakeAnalyser();
  resume = vi.fn(async () => {
    this.state = resumesTo;
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createMediaElementSource = vi.fn(() => this.source);
  createAnalyser = vi.fn(() => this.analyser);

  constructor() {
    FakeContext.made.push(this);
  }
}

function media(): HTMLMediaElement {
  return document.createElement('video');
}

beforeEach(() => {
  resumesTo = 'running';
  FakeContext.made = [];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('webkitAudioContext', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAudioGraph', () => {
  it('reports no support when the browser has no AudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { result } = renderHook(() => useAudioGraph(media()));

    expect(result.current.supported).toBe(false);
    await act(() => result.current.connect());
    expect(result.current.analyser).toBeNull();
    expect(FakeContext.made).toHaveLength(0);
  });

  it('wires element → analyser → speakers on the first connect', async () => {
    const element = media();
    const { result } = renderHook(() => useAudioGraph(element));
    await act(() => result.current.connect());

    const context = FakeContext.made[0];
    expect(context).toBeDefined();
    expect(context?.createMediaElementSource).toHaveBeenCalledWith(element);
    expect(context?.source.connect).toHaveBeenCalledWith(context?.analyser);
    expect(context?.analyser.connect).toHaveBeenCalledWith(context?.destination);
    expect(context?.analyser.fftSize).toBe(2048);
    expect(result.current.analyser).toBe(context?.analyser);
    expect(result.current.supported).toBe(true);
  });

  it('builds the graph once, however often it is asked', async () => {
    const { result } = renderHook(() => useAudioGraph(media()));
    await act(() => result.current.connect());
    await act(() => result.current.connect());

    expect(FakeContext.made).toHaveLength(1);
    expect(FakeContext.made[0]?.createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it('resumes a context the browser suspended rather than making another', async () => {
    const { result } = renderHook(() => useAudioGraph(media()));
    await act(() => result.current.connect());
    const context = FakeContext.made[0];
    if (context) context.state = 'suspended';

    await act(() => result.current.connect());
    expect(FakeContext.made).toHaveLength(1);
    expect(context?.resume).toHaveBeenCalledTimes(2);
  });

  it('gives up and hides itself when the context will not run', async () => {
    resumesTo = 'suspended';
    const { result } = renderHook(() => useAudioGraph(media()));
    await act(() => result.current.connect());

    expect(result.current.supported).toBe(false);
    expect(result.current.analyser).toBeNull();
    expect(FakeContext.made[0]?.close).toHaveBeenCalled();
  });

  it('reports no support when building the graph throws', async () => {
    const { result } = renderHook(() => useAudioGraph(media()));
    const failing = vi.fn(() => {
      throw new Error('already connected');
    });
    vi.stubGlobal(
      'AudioContext',
      class extends FakeContext {
        override createMediaElementSource = failing;
      },
    );
    await act(() => result.current.connect());

    expect(failing).toHaveBeenCalled();
    expect(result.current.supported).toBe(false);
    expect(result.current.analyser).toBeNull();
  });

  it('closes the context and drops the source when the window goes', async () => {
    const { result, unmount } = renderHook(() => useAudioGraph(media()));
    await act(() => result.current.connect());
    const context = FakeContext.made[0];

    unmount();
    expect(context?.source.disconnect).toHaveBeenCalled();
    expect(context?.close).toHaveBeenCalled();
  });

  it('does nothing without an element', async () => {
    const { result } = renderHook(() => useAudioGraph(null));
    await act(() => result.current.connect());
    expect(FakeContext.made).toHaveLength(0);
    expect(result.current.analyser).toBeNull();
  });
});

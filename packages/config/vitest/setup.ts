import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library only registers its own cleanup when Vitest globals are on,
 * and this config deliberately keeps `globals: false`. Without this, every
 * render in a file stays mounted for the rest of that file: the trees pile up
 * in one document, queries start finding several copies of the same element,
 * and because the kernel stores are module state the stale trees keep
 * re-rendering as later tests drive them. Unmounting after each test is what
 * makes a `getByTestId` mean one thing.
 */
afterEach(cleanup);

// happy-dom lacks a few APIs the shell relies on; stub the ones tests touch.
if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
if (typeof globalThis.ResizeObserver !== 'function') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverStub,
  });
}
if (typeof globalThis.requestAnimationFrame !== 'function') {
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    writable: true,
    value: (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16),
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    writable: true,
    value: (id: number) => clearTimeout(id),
  });
}

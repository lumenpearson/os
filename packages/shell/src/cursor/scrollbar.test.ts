import { describe, expect, it } from 'vitest';
import { onScrollbar } from './scrollbar';

/** An element that reports a scrollable box with a 15 px gutter. */
function scrollable({
  scrollHeight = 400,
  clientHeight = 200,
  scrollWidth = 300,
  clientWidth = 300,
}): HTMLElement {
  const el = document.createElement('div');
  const rect = { left: 100, top: 50, width: 315, height: 200 };
  Object.defineProperties(el, {
    scrollHeight: { value: scrollHeight },
    clientHeight: { value: clientHeight },
    scrollWidth: { value: scrollWidth },
    clientWidth: { value: clientWidth },
    getBoundingClientRect: {
      value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    },
  });
  return el;
}

describe('onScrollbar', () => {
  it('says yes past the right edge of a vertically scrolling box', () => {
    const el = scrollable({});
    expect(onScrollbar(el, 100 + 300 + 5, 120)).toBe(true);
    expect(onScrollbar(el, 100 + 200, 120)).toBe(false);
  });

  it('says yes below the bottom edge of a horizontally scrolling box', () => {
    const el = scrollable({ scrollWidth: 900, clientWidth: 300, scrollHeight: 200 });
    expect(onScrollbar(el, 200, 50 + 200 + 4)).toBe(true);
  });

  it('says no when the box does not scroll at all', () => {
    const el = scrollable({ scrollHeight: 200, clientHeight: 200 });
    expect(onScrollbar(el, 100 + 305, 120)).toBe(false);
  });

  it('says no for anything that is not an element', () => {
    expect(onScrollbar(null, 0, 0)).toBe(false);
    expect(onScrollbar(document.createTextNode('x') as unknown as EventTarget, 0, 0)).toBe(false);
  });
});

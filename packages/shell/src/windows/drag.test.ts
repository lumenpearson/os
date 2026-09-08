import { describe, expect, it } from 'vitest';
import { isDragSurface } from './drag';

function within(html: string): { frame: HTMLElement; target: Element } {
  const frame = document.createElement('div');
  frame.innerHTML = html;
  document.body.append(frame);
  const target = frame.firstElementChild;
  if (!target) throw new Error('nothing to aim at');
  return { frame, target };
}

const surface = (over: Partial<Parameters<typeof isDragSurface>[0]> = {}) =>
  isDragSurface({ offsetY: 12, titleBarHeight: 36, target: null, frame: null, ...over });

describe('isDragSurface', () => {
  it('drags from anywhere along the title bar, not only near the controls', () => {
    const { frame, target } = within('<div class="breadcrumb">Home</div>');
    expect(surface({ target, frame })).toBe(true);
    // The far end of the bar drags just as well as the near end.
    expect(surface({ target, frame, offsetY: 35 })).toBe(true);
  });

  it('leaves the app content below the bar alone', () => {
    expect(surface({ offsetY: 37 })).toBe(false);
    expect(surface({ offsetY: -1 })).toBe(false);
  });

  it('does not drag from a control the app put in the bar', () => {
    for (const html of [
      '<button type="button">Back</button>',
      '<input aria-label="Search" />',
      '<a href="/">Home</a>',
      '<div role="button">Sort</div>',
      '<div data-no-drag>Window controls</div>',
    ]) {
      const { frame, target } = within(html);
      expect(surface({ target, frame }), html).toBe(false);
    }
  });

  it('follows the control up through the elements inside it', () => {
    const { frame } = within('<button type="button"><span>Back</span></button>');
    const label = frame.querySelector('span');
    expect(surface({ target: label, frame })).toBe(false);
  });

  it('ignores a control that belongs to another window', () => {
    const { target } = within('<button type="button">Elsewhere</button>');
    const other = document.createElement('div');
    expect(surface({ target, frame: other })).toBe(true);
  });
});

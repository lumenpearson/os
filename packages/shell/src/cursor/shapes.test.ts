import { afterEach, describe, expect, it } from 'vitest';
import { CURSOR_TO_SHAPE, shapeForCursor, shapeForElement } from './shapes';

describe('the shape a CSS cursor asks for', () => {
  it('gives a column and a row resize their own shapes', () => {
    // Sheets and the tables ask for these, and both used to draw the shape
    // for dragging a window edge — which says the wrong thing about what is
    // about to move.
    expect(shapeForCursor('col-resize')).toBe('col');
    expect(shapeForCursor('row-resize')).toBe('row');
    expect(shapeForCursor('ew-resize')).toBe('ew');
    expect(shapeForCursor('ns-resize')).toBe('ns');
  });

  it('gives a single direction a single arrow', () => {
    // These used to fold onto the two-headed arrow, which is a shrug where
    // the drawing knows the answer: dragging the east edge moves that edge,
    // and the cursor can say so.
    expect(shapeForCursor('e-resize')).toBe('e');
    expect(shapeForCursor('w-resize')).toBe('w');
    expect(shapeForCursor('ne-resize')).toBe('ne');
    expect(shapeForCursor('sw-resize')).toBe('sw');
    // The two-headed ones stay two-headed: both edges move together.
    expect(shapeForCursor('ew-resize')).toBe('ew');
    expect(shapeForCursor('nesw-resize')).toBe('nesw');
  });

  it('tells waiting apart from working', () => {
    // A beachball says the OS has stopped answering; the arrow with a spinner
    // says it is busy and still takes the click.
    expect(shapeForCursor('wait')).toBe('wait');
    expect(shapeForCursor('progress')).toBe('progress');
  });

  it('falls back to the arrow for a value it does not draw, and for none at all', () => {
    expect(shapeForCursor('grabbing-nonsense')).toBe('arrow');
    expect(shapeForCursor(undefined)).toBe('arrow');
    expect(shapeForCursor('')).toBe('arrow');
  });

  it('ignores the whitespace a computed style can carry', () => {
    expect(shapeForCursor('  pointer  ')).toBe('pointer');
  });

  it('maps every cursor class the interface actually uses', () => {
    // Whatever the components ask for has to arrive somewhere on purpose; a
    // value nobody mapped becomes an arrow silently.
    const used = [
      'default',
      'pointer',
      'grab',
      'grabbing',
      'crosshair',
      'none',
      'col-resize',
      'row-resize',
      'text',
      'move',
      'not-allowed',
      'help',
      'cell',
      'copy',
      'alias',
      'context-menu',
      'zoom-in',
      'zoom-out',
      'progress',
      'wait',
    ];
    for (const value of used) expect(CURSOR_TO_SHAPE[value]).toBeDefined();
  });
});

/**
 * What an element is, when the stylesheet cannot be asked.
 *
 * While the drawn cursor is on, `[data-lumen-cursor="custom"] *` sets
 * `cursor: none !important` on every element in the OS, so the computed value
 * the layer used to read said `none` for all of them and every shape fell
 * back to the arrow. Only the handful of places that had remembered a
 * `data-cursor` attribute ever changed the pointer: a button, a tab, a menu
 * item and the paragraph beside them all drew the same arrow.
 */
describe('the shape an element asks for by what it is', () => {
  const mount = (html: string) => {
    document.body.innerHTML = html;
    return (selector: string) => document.querySelector(selector);
  };
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('gives the hand to everything a click acts on', () => {
    const find = mount(`
      <button id="b">Save</button>
      <a id="a" href="/x">link</a>
      <div id="r" role="button">custom</div>
      <div id="t" role="tab">Tab</div>
      <div id="m" role="menuitem">Open</div>
      <div id="o" role="option">Row</div>
      <input id="c" type="checkbox">
      <select id="s"><option>one</option></select>
    `);
    for (const id of ['#b', '#a', '#r', '#t', '#m', '#o', '#c', '#s']) {
      expect(shapeForElement(find(id)), id).toBe('pointer');
    }
  });

  it('starts from what the pointer is over, not from the control', () => {
    // A click lands on the glyph inside the button far more often than on
    // the button, and a window's traffic light is exactly that shape.
    const find = mount('<button aria-label="Close"><svg><path id="p"/></svg></button>');
    expect(shapeForElement(find('#p'))).toBe('pointer');
  });

  it('says a control that will not act will not act', () => {
    const find = mount(`
      <button id="d" disabled>Save</button>
      <div id="a" role="button" aria-disabled="true">Save</div>
    `);
    expect(shapeForElement(find('#d'))).toBe('not-allowed');
    expect(shapeForElement(find('#a'))).toBe('not-allowed');
  });

  it('gives the beam to somewhere a caret goes', () => {
    const find = mount(`
      <input id="t" type="text">
      <textarea id="a"></textarea>
      <div id="e" contenteditable="true">words</div>
    `);
    for (const id of ['#t', '#a', '#e']) expect(shapeForElement(find(id)), id).toBe('text');
  });

  it('lets the nearest answer win', () => {
    // A disabled button inside a clickable row is not-allowed; the row's own
    // answer is further away and does not apply to the button.
    const find = mount(`
      <div role="button"><button id="inner" disabled>Save</button></div>
      <div data-cursor="col-resize"><button id="split">Collapse</button></div>
    `);
    expect(shapeForElement(find('#inner'))).toBe('not-allowed');
    expect(shapeForElement(find('#split'))).toBe('pointer');
  });

  it('takes an attribute over an inference, at the same element', () => {
    const find = mount('<button id="b" data-cursor="zoom-in">Zoom</button>');
    expect(shapeForElement(find('#b'))).toBe('zoom-in');
  });

  it('has no opinion about ordinary content, and stops where it is told', () => {
    const find = mount('<p id="p">Just words</p><div id="w"><span id="s"></span></div>');
    expect(shapeForElement(find('#p'))).toBeNull();
    // The walk stops before the element it is given as the end.
    const wrapper = find('#w') as Element;
    wrapper.setAttribute('data-cursor', 'crosshair');
    expect(shapeForElement(find('#s'), wrapper)).toBeNull();
    expect(shapeForElement(find('#s'))).toBe('crosshair');
  });
});

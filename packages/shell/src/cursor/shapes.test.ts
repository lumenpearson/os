import { describe, expect, it } from 'vitest';
import { CURSOR_TO_SHAPE, shapeForCursor } from './shapes';

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

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

  it('folds the eight edge directions onto the four arrows that show them', () => {
    for (const value of ['e-resize', 'w-resize', 'ew-resize']) {
      expect(shapeForCursor(value)).toBe('ew');
    }
    for (const value of ['ne-resize', 'sw-resize', 'nesw-resize']) {
      expect(shapeForCursor(value)).toBe('nesw');
    }
  });

  it('falls back to the arrow for a value it does not draw, and for none at all', () => {
    expect(shapeForCursor('zoom-in')).toBe('arrow');
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
    ];
    for (const value of used) expect(CURSOR_TO_SHAPE[value]).toBeDefined();
  });
});

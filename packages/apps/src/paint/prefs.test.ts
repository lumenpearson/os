import { describe, expect, it } from 'vitest';
import { DEFAULT_CANVAS } from './document';
import { DEFAULT_PREFS, MAX_BRUSH, normalizePrefs } from './prefs';

describe('normalizePrefs', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const junk of [null, undefined, 4, 'prefs', [], true]) {
      expect(normalizePrefs(junk)).toEqual(DEFAULT_PREFS);
    }
  });

  it('keeps a well-formed file as it is', () => {
    const stored = {
      ...DEFAULT_PREFS,
      tool: 'brush',
      foreground: '#ff0000',
      recent: ['#ff0000', '#00ff00'],
    };
    expect(normalizePrefs(stored)).toEqual(stored);
  });

  it('falls back on an unknown tool', () => {
    expect(normalizePrefs({ tool: 'airbrush' }).tool).toBe(DEFAULT_PREFS.tool);
    expect(normalizePrefs({ tool: 'eraser' }).tool).toBe('eraser');
  });

  it('normalises colours and drops malformed ones', () => {
    expect(normalizePrefs({ foreground: 'F00' }).foreground).toBe('#ff0000');
    expect(normalizePrefs({ foreground: 'not a colour' }).foreground).toBe(
      DEFAULT_PREFS.foreground,
    );
    expect(normalizePrefs({ background: 42 }).background).toBe(DEFAULT_PREFS.background);
  });

  it('clamps the numbers into their ranges', () => {
    expect(normalizePrefs({ brushSize: 900 }).brushSize).toBe(MAX_BRUSH);
    expect(normalizePrefs({ brushSize: 0 }).brushSize).toBe(1);
    expect(normalizePrefs({ brushSize: 4.6 }).brushSize).toBe(5);
    expect(normalizePrefs({ hardness: -3 }).hardness).toBe(0);
    expect(normalizePrefs({ hardness: 3 }).hardness).toBe(1);
    expect(normalizePrefs({ tolerance: 4000 }).tolerance).toBe(255);
    expect(normalizePrefs({ textSize: 2 }).textSize).toBe(8);
    expect(normalizePrefs({ brushSize: Number.NaN }).brushSize).toBe(DEFAULT_PREFS.brushSize);
    expect(normalizePrefs({ brushSize: '12' }).brushSize).toBe(DEFAULT_PREFS.brushSize);
  });

  it('keeps only the shape styles it draws', () => {
    expect(normalizePrefs({ shapeStyle: 'fill' }).shapeStyle).toBe('fill');
    expect(normalizePrefs({ shapeStyle: 'dashed' }).shapeStyle).toBe(DEFAULT_PREFS.shapeStyle);
  });

  it('filters the recent swatches and caps them', () => {
    expect(normalizePrefs({ recent: ['#abc', 7, null, 'zzz', '#123456'] }).recent).toEqual([
      '#aabbcc',
      '#123456',
    ]);
    expect(normalizePrefs({ recent: new Array(40).fill('#123456') }).recent).toHaveLength(12);
    expect(normalizePrefs({ recent: 'red' }).recent).toEqual([]);
  });

  it('repairs the remembered canvas size', () => {
    expect(normalizePrefs({ canvas: { width: 0, height: 99999 } }).canvas).toEqual({
      width: 1,
      height: 8192,
    });
    expect(normalizePrefs({ canvas: 'big' }).canvas).toEqual(DEFAULT_CANVAS);
  });

  it('reads a boolean flag as a boolean', () => {
    expect(normalizePrefs({ showGrid: false }).showGrid).toBe(false);
    expect(normalizePrefs({ showGrid: 'yes' }).showGrid).toBe(DEFAULT_PREFS.showGrid);
  });
});

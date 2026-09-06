import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOL,
  isFreehandTool,
  isShapeTool,
  isToolId,
  TOOL_ORDER,
  TOOL_SPECS,
  TOOLS,
  toolForKey,
  toolSpec,
  usesOption,
} from './tools';

describe('the palette', () => {
  it('lists every tool once, in order', () => {
    expect(TOOLS).toHaveLength(TOOL_ORDER.length);
    expect(new Set(TOOL_ORDER).size).toBe(TOOL_ORDER.length);
    expect(TOOLS.map((t) => t.id)).toEqual([...TOOL_ORDER]);
  });

  it('has a spec for every id and no orphan specs', () => {
    expect(Object.keys(TOOL_SPECS).sort()).toEqual([...TOOL_ORDER].sort());
    for (const id of TOOL_ORDER) expect(toolSpec(id).id).toBe(id);
  });

  it('gives each tool its own key, a label and a hint', () => {
    const keys = TOOLS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const tool of TOOLS) {
      expect(tool.key).toMatch(/^[a-z]$/);
      expect(tool.label.length).toBeGreaterThan(0);
      expect(tool.hint.endsWith('.')).toBe(true);
    }
  });

  it('claims a point where one is placed, and an area where the fill spreads', () => {
    const precise = [
      'pencil',
      'brush',
      'eraser',
      'line',
      'rectangle',
      'ellipse',
      'select',
    ] as const;
    for (const id of precise) expect(toolSpec(id).cursor).toBe('crosshair');
    expect(toolSpec('fill').cursor).toBe('cell');
    expect(toolSpec('text').cursor).toBe('text');
  });

  it('starts on the pencil', () => {
    expect(DEFAULT_TOOL).toBe('pencil');
    expect(isToolId(DEFAULT_TOOL)).toBe(true);
  });
});

describe('toolForKey', () => {
  it('finds a tool whatever the case', () => {
    expect(toolForKey('b')).toBe('brush');
    expect(toolForKey('B')).toBe('brush');
    expect(toolForKey('m')).toBe('select');
  });

  it('is null for a key no tool claims', () => {
    expect(toolForKey('q')).toBeNull();
    expect(toolForKey('')).toBeNull();
    expect(toolForKey('Enter')).toBeNull();
  });
});

describe('options', () => {
  it('shows size where a stroke has width, and nowhere else', () => {
    expect(usesOption('brush', 'size')).toBe(true);
    expect(usesOption('line', 'size')).toBe(true);
    expect(usesOption('fill', 'size')).toBe(false);
    expect(usesOption('eyedropper', 'size')).toBe(false);
  });

  it('shows hardness only on the brush and tolerance only on the fill', () => {
    expect(usesOption('brush', 'hardness')).toBe(true);
    expect(usesOption('pencil', 'hardness')).toBe(false);
    expect(usesOption('fill', 'tolerance')).toBe(true);
    expect(usesOption('brush', 'tolerance')).toBe(false);
  });

  it('offers a fill style on the closed shapes only', () => {
    expect(usesOption('rectangle', 'shape')).toBe(true);
    expect(usesOption('ellipse', 'shape')).toBe(true);
    expect(usesOption('line', 'shape')).toBe(false);
  });
});

describe('tool families', () => {
  it('knows the dragged shapes', () => {
    expect(TOOL_ORDER.filter(isShapeTool)).toEqual(['line', 'rectangle', 'ellipse']);
  });

  it('knows the freehand tools', () => {
    expect(TOOL_ORDER.filter(isFreehandTool)).toEqual(['pencil', 'brush', 'eraser']);
  });

  it('narrows an unknown value', () => {
    expect(isToolId('brush')).toBe(true);
    expect(isToolId('airbrush')).toBe(false);
    expect(isToolId(null)).toBe(false);
    expect(isToolId(3)).toBe(false);
  });
});

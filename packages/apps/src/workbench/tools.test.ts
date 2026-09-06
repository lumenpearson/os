import { describe, expect, it } from 'vitest';
import { isToolId, stepTool, TOOL_LABEL, TOOL_SHORTCUT, TOOL_SUMMARY, TOOLS } from './tools';

describe('the tool list', () => {
  it('labels and describes every tool exactly once', () => {
    expect(Object.keys(TOOL_LABEL).sort()).toEqual([...TOOLS].sort());
    expect(Object.keys(TOOL_SUMMARY).sort()).toEqual([...TOOLS].sort());
    expect(new Set(Object.values(TOOL_LABEL)).size).toBe(TOOLS.length);
  });

  it('numbers the shortcuts in list order', () => {
    expect(TOOL_SHORTCUT.json).toBe('Mod+1');
    expect(TOOL_SHORTCUT[TOOLS[TOOLS.length - 1] as 'hash']).toBe(`Mod+${TOOLS.length}`);
    expect(new Set(Object.values(TOOL_SHORTCUT)).size).toBe(TOOLS.length);
  });
});

describe('isToolId', () => {
  it('accepts a tool and refuses anything else', () => {
    expect(isToolId('json')).toBe(true);
    expect(isToolId('JSON')).toBe(false);
    expect(isToolId('')).toBe(false);
    expect(isToolId(undefined)).toBe(false);
    expect(isToolId({ tool: 'json' })).toBe(false);
  });
});

describe('stepTool', () => {
  it('moves along the list', () => {
    expect(stepTool('json', 1)).toBe('regex');
    expect(stepTool('regex', -1)).toBe('json');
  });

  it('wraps at both ends', () => {
    expect(stepTool(TOOLS[0] as 'json', -1)).toBe(TOOLS[TOOLS.length - 1]);
    expect(stepTool(TOOLS[TOOLS.length - 1] as 'hash', 1)).toBe(TOOLS[0]);
  });

  it('visits every tool once before coming back', () => {
    const seen = new Set<string>();
    let tool = TOOLS[0] as 'json';
    for (let i = 0; i < TOOLS.length; i += 1) {
      seen.add(tool);
      tool = stepTool(tool, 1) as 'json';
    }
    expect(seen.size).toBe(TOOLS.length);
    expect(tool).toBe(TOOLS[0]);
  });
});

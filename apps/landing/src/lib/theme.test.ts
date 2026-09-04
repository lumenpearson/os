import { describe, expect, it } from 'vitest';
import { otherTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('uses the stored choice when there is one', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('follows the system preference when nothing is stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('light');
  });

  it('ignores values that are not a theme', () => {
    expect(resolveTheme('sepia', true)).toBe('dark');
    expect(resolveTheme(42, false)).toBe('light');
  });
});

describe('otherTheme', () => {
  it('flips between the two themes', () => {
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });
});

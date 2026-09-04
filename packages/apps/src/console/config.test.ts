import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, normalizeConfig, toggleLevel } from './config';

describe('normalizeConfig', () => {
  it('shows every level by default', () => {
    expect(DEFAULT_CONFIG.levels).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('falls back when the file is missing or not an object', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig('levels')).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('keeps the stored levels in level order and drops what it does not know', () => {
    expect(normalizeConfig({ levels: ['error', 'nonsense', 'debug', 7] })).toEqual({
      levels: ['debug', 'error'],
    });
  });

  it('reads an empty list as no preference, not as a blank window', () => {
    expect(normalizeConfig({ levels: [] })).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig({ levels: ['nope'] })).toEqual(DEFAULT_CONFIG);
  });

  it('does not hand back the default array itself', () => {
    const first = normalizeConfig(null);
    first.levels.push('error');
    expect(DEFAULT_CONFIG.levels).toEqual(['debug', 'info', 'warn', 'error']);
  });
});

describe('toggleLevel', () => {
  it('turns a level off', () => {
    expect(toggleLevel(['debug', 'info', 'warn', 'error'], 'warn')).toEqual([
      'debug',
      'info',
      'error',
    ]);
  });

  it('turns a level on, in level order', () => {
    expect(toggleLevel(['error'], 'debug')).toEqual(['debug', 'error']);
  });

  it('can turn every level off', () => {
    expect(toggleLevel(['error'], 'error')).toEqual([]);
  });
});

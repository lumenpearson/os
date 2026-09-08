import { describe, expect, it } from 'vitest';
import {
  BASIC_LAYOUT,
  type KeyDef,
  type KeyEventLike,
  LAYOUTS,
  type Layout,
  PROGRAMMER_LAYOUT,
  resolveKey,
  SCIENTIFIC_LAYOUT,
  trigKey,
} from './keys';
import { MODES } from './storage';

const press = (key: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

/** The key a keystroke lands on, or null. */
const hit = (layout: Layout, key: string, modifiers?: Partial<KeyEventLike>): KeyDef | null =>
  resolveKey(layout, press(key, modifiers))?.key ?? null;

const find = (layout: Layout, id: string): KeyDef => {
  const key = layout.keys.find((k) => k.id === id);
  if (!key) throw new Error(`no key "${id}" in this layout`);
  return key;
};

describe('the layouts', () => {
  it('covers every mode', () => {
    expect(Object.keys(LAYOUTS).sort()).toEqual([...MODES].sort());
    expect(LAYOUTS.basic).toBe(BASIC_LAYOUT);
    expect(LAYOUTS.scientific).toBe(SCIENTIFIC_LAYOUT);
    expect(LAYOUTS.programmer).toBe(PROGRAMMER_LAYOUT);
  });

  it('gives every key a distinct id', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const ids = layout.keys.map((key) => key.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('gives every key something to do', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const key of layout.keys) {
        expect(key.label.length, key.id).toBeGreaterThan(0);
        expect(Boolean(key.insert || key.action), key.id).toBe(true);
      }
    }
  });

  it('fills whole rows', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const cells = layout.keys.reduce((total, key) => total + (key.span ?? 1), 0);
      expect(cells % layout.columns).toBe(0);
    }
  });

  it('has a keyboard equivalent for every digit and operator', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const key of layout.keys) {
        if (key.tone === 'digit' || key.tone === 'operator')
          expect(key.keys?.length ?? 0, key.id).toBeGreaterThan(0);
      }
    }
  });

  it('reaches the digits, the operators and the commands from the keyboard', () => {
    for (const digit of '0123456789') expect(hit(BASIC_LAYOUT, digit)?.insert).toBe(digit);
    expect(hit(BASIC_LAYOUT, '+')?.id).toBe('add');
    expect(hit(BASIC_LAYOUT, '-')?.id).toBe('subtract');
    expect(hit(BASIC_LAYOUT, '*')?.id).toBe('multiply');
    expect(hit(BASIC_LAYOUT, '/')?.id).toBe('divide');
    expect(hit(BASIC_LAYOUT, '%')?.id).toBe('percent');
    expect(hit(BASIC_LAYOUT, '.')?.id).toBe('dot');
    expect(hit(BASIC_LAYOUT, 'Enter')?.id).toBe('equals');
    expect(hit(BASIC_LAYOUT, '=')?.id).toBe('equals');
    expect(hit(BASIC_LAYOUT, 'Escape')?.id).toBe('clear');
    expect(hit(BASIC_LAYOUT, 'Backspace')?.id).toBe('backspace');
  });

  it('reaches the brackets and the power in scientific mode', () => {
    expect(hit(SCIENTIFIC_LAYOUT, '(')?.id).toBe('open');
    expect(hit(SCIENTIFIC_LAYOUT, ')')?.id).toBe('close');
    expect(hit(SCIENTIFIC_LAYOUT, '^')?.id).toBe('power');
    expect(hit(SCIENTIFIC_LAYOUT, '!')?.id).toBe('factorial');
  });

  it('reaches the bitwise operations in programmer mode', () => {
    expect(hit(PROGRAMMER_LAYOUT, '&')?.operator).toBe('and');
    expect(hit(PROGRAMMER_LAYOUT, '|')?.operator).toBe('or');
    expect(hit(PROGRAMMER_LAYOUT, '^')?.operator).toBe('xor');
    expect(hit(PROGRAMMER_LAYOUT, '<')?.operator).toBe('shl');
    expect(hit(PROGRAMMER_LAYOUT, '>')?.operator).toBe('shr');
    expect(hit(PROGRAMMER_LAYOUT, '%')?.operator).toBe('mod');
    expect(hit(PROGRAMMER_LAYOUT, '~')?.id).toBe('not');
  });
});

describe('resolveKey', () => {
  it('leaves the keystroke to the field when the field can do it', () => {
    expect(resolveKey(BASIC_LAYOUT, press('7'))).toEqual({
      kind: 'flash',
      key: find(BASIC_LAYOUT, 'digit-7'),
    });
    expect(resolveKey(BASIC_LAYOUT, press('Backspace'))?.kind).toBe('flash');
    expect(resolveKey(BASIC_LAYOUT, press('+'))?.kind).toBe('flash');
  });

  it('takes the keystroke itself when the field cannot', () => {
    expect(resolveKey(BASIC_LAYOUT, press('Enter'))?.kind).toBe('run');
    expect(resolveKey(BASIC_LAYOUT, press('Escape'))?.kind).toBe('run');
  });

  it('takes every keystroke in programmer mode', () => {
    for (const key of PROGRAMMER_LAYOUT.keys) expect(key.native, key.id).toBe(false);
    expect(resolveKey(PROGRAMMER_LAYOUT, press('7'))?.kind).toBe('run');
    expect(resolveKey(PROGRAMMER_LAYOUT, press('Backspace'))?.kind).toBe('run');
  });

  it('ignores the case of a letter key', () => {
    expect(hit(PROGRAMMER_LAYOUT, 'a')?.id).toBe('digit-A');
    expect(hit(PROGRAMMER_LAYOUT, 'A')?.id).toBe('digit-A');
    expect(hit(PROGRAMMER_LAYOUT, 'f')?.id).toBe('digit-F');
  });

  it('does not confuse a named key with a letter', () => {
    expect(hit(BASIC_LAYOUT, 'Enter')?.id).toBe('equals');
    expect(hit(BASIC_LAYOUT, 'enter')).toBeNull();
  });

  it('leaves modified keystrokes to the menus', () => {
    expect(resolveKey(BASIC_LAYOUT, press('7', { ctrlKey: true }))).toBeNull();
    expect(resolveKey(BASIC_LAYOUT, press('c', { metaKey: true }))).toBeNull();
    expect(resolveKey(BASIC_LAYOUT, press('1', { altKey: true }))).toBeNull();
  });

  it('ignores a keystroke no button owns', () => {
    expect(resolveKey(BASIC_LAYOUT, press('q'))).toBeNull();
    expect(resolveKey(BASIC_LAYOUT, press('ArrowLeft'))).toBeNull();
    expect(resolveKey(BASIC_LAYOUT, press('a'))).toBeNull();
  });
});

describe('trigKey', () => {
  it('is the plain function by default', () => {
    expect(trigKey('sin', { second: false, hyperbolic: false })).toEqual({
      label: 'sin',
      insert: 'sin(',
    });
  });

  it('inverts under 2nd', () => {
    expect(trigKey('cos', { second: true, hyperbolic: false })).toEqual({
      label: 'cos⁻¹',
      insert: 'acos(',
    });
  });

  it('goes hyperbolic under hyp', () => {
    expect(trigKey('tan', { second: false, hyperbolic: true })).toEqual({
      label: 'tanh',
      insert: 'tanh(',
    });
  });

  it('combines both', () => {
    expect(trigKey('sin', { second: true, hyperbolic: true })).toEqual({
      label: 'sinh⁻¹',
      insert: 'asinh(',
    });
  });
});

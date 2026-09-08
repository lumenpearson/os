import { beforeEach, describe, expect, it } from 'vitest';
import type { Base, WordSize } from './bases';
import {
  currentValue,
  displayText,
  INITIAL_PROGRAMMER,
  OP_LABEL,
  type ProgrammerAction,
  type ProgrammerContext,
  type ProgrammerState,
  reduceProgrammer,
} from './programmer';
import type { TapeEntry } from './storage';

const context = (base: Base = 'dec', wordSize: WordSize = 32): ProgrammerContext => ({
  base,
  wordSize,
});

/** Run a sequence of actions from the initial state. */
function run(
  actions: ProgrammerAction[],
  ctx: ProgrammerContext = context(),
): { state: ProgrammerState; tape: TapeEntry[] } {
  let state = INITIAL_PROGRAMMER;
  const tape: TapeEntry[] = [];
  for (const action of actions) {
    const result = reduceProgrammer(state, action, ctx);
    state = result.state;
    if (result.tape) tape.push(result.tape);
  }
  return { state, tape };
}

const digits = (text: string): ProgrammerAction[] =>
  text.split('').map((digit) => ({ type: 'digit', digit }));

describe('typing digits', () => {
  it('builds an entry one digit at a time', () => {
    const { state } = run(digits('123'));
    expect(state.entry).toBe('123');
    expect(currentValue(state, context())).toBe(123n);
    expect(displayText(state, context())).toBe('123');
  });

  it('replaces a lone zero rather than growing it', () => {
    expect(run(digits('007')).state.entry).toBe('7');
  });

  it('stops at the digits the word can hold', () => {
    expect(run(digits('123'), context('hex', 8)).state.entry).toBe('12');
    expect(run(digits('111111111'), context('bin', 8)).state.entry).toBe('11111111');
    expect(run(digits('123456'), context('dec', 8)).state.entry).toBe('123');
  });

  it('masks an entry that is larger than the word', () => {
    const { state } = run(digits('FF'), context('hex', 8));
    expect(currentValue(state, context('hex', 8))).toBe(-1n);
    expect(displayText(state, context('hex', 8))).toBe('FF');
  });

  it('takes pasted text and keeps only the digits of the base', () => {
    const { state } = run([{ type: 'entry', text: 'de ad!' }], context('hex', 32));
    expect(state.entry).toBe('DEAD');
    expect(currentValue(state, context('hex', 32))).toBe(57005n);
  });
});

describe('pending operations', () => {
  it('folds the left side when an operator arrives', () => {
    const { state } = run([...digits('12'), { type: 'operator', operator: 'add' }]);
    expect(state.accumulator).toBe(12n);
    expect(state.entry).toBe('');
    expect(state.operator).toBe('add');
    expect(state.pending).toBe('12 +');
  });

  it('completes on equals and writes a tape line', () => {
    const { state, tape } = run([
      ...digits('12'),
      { type: 'operator', operator: 'add' },
      ...digits('3'),
      { type: 'equals' },
    ]);
    expect(state.accumulator).toBe(15n);
    expect(state.operator).toBeNull();
    expect(tape).toHaveLength(1);
    expect(tape[0]?.expression).toBe('12 + 3');
    expect(tape[0]?.result).toBe('15');
  });

  it('chains: each operator folds the one before it', () => {
    const { state } = run([
      ...digits('2'),
      { type: 'operator', operator: 'add' },
      ...digits('3'),
      { type: 'operator', operator: 'mul' },
      ...digits('4'),
      { type: 'equals' },
    ]);
    expect(state.accumulator).toBe(20n);
  });

  it('writes no tape line when equals had nothing to do', () => {
    const { state, tape } = run([...digits('7'), { type: 'equals' }]);
    expect(state.accumulator).toBe(7n);
    expect(tape).toHaveLength(0);
  });

  it('tags a tape line with the base it was in', () => {
    const { tape } = run(
      [...digits('FF'), { type: 'operator', operator: 'and' }, ...digits('F'), { type: 'equals' }],
      context('hex', 32),
    );
    expect(tape[0]?.expression).toBe('0xFF AND 0xF');
    expect(tape[0]?.result).toBe('0xF');
  });

  it('labels every operator', () => {
    expect(OP_LABEL.and).toBe('AND');
    expect(OP_LABEL.shl).toBe('<<');
    expect(OP_LABEL.mul).toBe('×');
  });
});

describe('word size', () => {
  it('wraps arithmetic to the word', () => {
    const ctx = context('dec', 8);
    const { state } = run(
      [...digits('127'), { type: 'operator', operator: 'add' }, ...digits('1'), { type: 'equals' }],
      ctx,
    );
    expect(state.accumulator).toBe(-128n);
    expect(displayText(state, ctx)).toBe('-128');
  });

  it('is exact at 64 bits', () => {
    const ctx = context('dec', 64);
    const { state } = run(
      [
        ...digits('9223372036854775807'),
        { type: 'operator', operator: 'add' },
        ...digits('1'),
        { type: 'equals' },
      ],
      ctx,
    );
    expect(state.accumulator).toBe(-9223372036854775808n);
    expect(displayText(state, { base: 'hex', wordSize: 64 })).toBe('8000000000000000');
  });

  it('re-masks the value when the word shrinks', () => {
    const wide = run(digits('300'), context('dec', 32)).state;
    const narrowed = reduceProgrammer(wide, { type: 'resize', from: 32 }, context('dec', 8)).state;
    expect(narrowed.entry).toBe('');
    expect(narrowed.accumulator).toBe(44n);
  });

  it('keeps a value that still fits when the word grows', () => {
    const small = run(digits('12'), context('dec', 8)).state;
    const grown = reduceProgrammer(small, { type: 'resize', from: 8 }, context('dec', 64)).state;
    expect(grown.accumulator).toBe(12n);
  });

  it('re-masks a signed value when the word grows', () => {
    const small = run([{ type: 'value', value: -1n }], context('dec', 8)).state;
    const grown = reduceProgrammer(small, { type: 'resize', from: 8 }, context('dec', 32)).state;
    expect(grown.accumulator).toBe(-1n);
    expect(displayText(grown, context('hex', 32))).toBe('FFFFFFFF');
  });
});

describe('changing base', () => {
  it('rewrites what is being typed into the new base', () => {
    const typed = run(digits('255'), context('dec', 32)).state;
    const rebased = reduceProgrammer(typed, { type: 'rebase', from: 'dec' }, context('hex', 32));
    expect(rebased.state.entry).toBe('FF');
  });

  it('leaves the accumulator alone: only its rendering changes', () => {
    const state = run([{ type: 'value', value: 255n }], context('dec', 32)).state;
    expect(displayText(state, context('dec', 32))).toBe('255');
    expect(displayText(state, context('hex', 32))).toBe('FF');
    expect(displayText(state, context('oct', 32))).toBe('377');
    expect(displayText(state, context('bin', 32))).toBe('11111111');
  });

  it('drops digits the new base cannot hold', () => {
    const typed = run(digits('9'), context('dec', 32)).state;
    const rebased = reduceProgrammer(typed, { type: 'rebase', from: 'bin' }, context('bin', 32));
    expect(rebased.state.entry).toBe('');
  });
});

describe('single-value keys', () => {
  it('complements and negates the shown value', () => {
    const ctx = context('hex', 8);
    const zero = run([{ type: 'not' }], ctx).state;
    expect(zero.accumulator).toBe(-1n);
    expect(displayText(zero, ctx)).toBe('FF');
    const five = run([...digits('5'), { type: 'negate' }], context('dec', 8)).state;
    expect(five.accumulator).toBe(-5n);
  });

  it('takes the entry as the value it works on', () => {
    const ctx = context('dec', 8);
    const { state } = run([...digits('15'), { type: 'not' }], ctx);
    expect(state.entry).toBe('');
    expect(state.accumulator).toBe(-16n);
  });

  it('clears everything', () => {
    const { state } = run([
      ...digits('12'),
      { type: 'operator', operator: 'add' },
      ...digits('3'),
      { type: 'clear' },
    ]);
    expect(state).toEqual(INITIAL_PROGRAMMER);
  });

  it('rubs out the last digit of the entry, then of the accumulator', () => {
    const ctx = context('dec', 32);
    expect(run([...digits('123'), { type: 'backspace' }], ctx).state.entry).toBe('12');
    const folded = run(
      [...digits('123'), { type: 'operator', operator: 'add' }, { type: 'backspace' }],
      ctx,
    ).state;
    expect(folded.accumulator).toBe(12n);
  });

  it('rubs a negative accumulator down to zero', () => {
    const ctx = context('dec', 8);
    const state = run([{ type: 'value', value: -1n }, { type: 'backspace' }], ctx).state;
    expect(state.accumulator).toBe(0n);
  });

  it('takes a value from outside, ending any pending operation', () => {
    const ctx = context('dec', 32);
    const { state } = run(
      [...digits('5'), { type: 'operator', operator: 'add' }, { type: 'value', value: 300n }],
      ctx,
    );
    expect(state.accumulator).toBe(300n);
    expect(state.operator).toBeNull();
    expect(state.pending).toBe('');
  });
});

describe('errors', () => {
  let divided: ProgrammerState;

  beforeEach(() => {
    divided = run([
      ...digits('6'),
      { type: 'operator', operator: 'div' },
      ...digits('0'),
      { type: 'equals' },
    ]).state;
  });

  it('reports division by zero and forgets the sum', () => {
    expect(divided.error).toBe('Division by zero');
    expect(divided.accumulator).toBe(0n);
  });

  it('clears the error on the next key', () => {
    const next = reduceProgrammer(divided, { type: 'digit', digit: '4' }, context()).state;
    expect(next.error).toBeNull();
    expect(next.entry).toBe('4');
  });

  it('reports a remainder by zero too', () => {
    const { state } = run([
      ...digits('6'),
      { type: 'operator', operator: 'mod' },
      ...digits('0'),
      { type: 'equals' },
    ]);
    expect(state.error).toBe('Division by zero');
  });
});

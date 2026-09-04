import { describe, expect, it } from 'vitest';
import { type Node, ParseError, parseFormula } from './parser';
import { tokenize } from './tokenizer';

const types = (src: string) => tokenize(src).map((t) => t.type);

describe('tokenizer', () => {
  it('reads numbers', () => {
    expect(tokenize('12')[0]).toMatchObject({ type: 'number', value: 12 });
    expect(tokenize('3.5')[0]).toMatchObject({ type: 'number', value: 3.5 });
    expect(tokenize('.5')[0]).toMatchObject({ type: 'number', value: 0.5 });
    expect(tokenize('1e3')[0]).toMatchObject({ type: 'number', value: 1000 });
  });

  it('reads strings with doubled quotes', () => {
    expect(tokenize('"hi"')[0]).toMatchObject({ type: 'string', value: 'hi' });
    expect(tokenize('"say ""hi"""')[0]).toMatchObject({ type: 'string', value: 'say "hi"' });
    expect(tokenize('""')[0]).toMatchObject({ type: 'string', value: '' });
  });

  it('rejects an unterminated string', () => {
    expect(() => tokenize('"abc')).toThrow(ParseError);
  });

  it('reads booleans', () => {
    expect(tokenize('TRUE')[0]).toMatchObject({ type: 'boolean', value: true });
    expect(tokenize('false')[0]).toMatchObject({ type: 'boolean', value: false });
  });

  it('reads cell references and ranges', () => {
    expect(tokenize('A1')[0]).toMatchObject({ type: 'ref' });
    expect(tokenize('$A$1')[0]).toMatchObject({ type: 'ref' });
    expect(tokenize('A1:B3')[0]).toMatchObject({ type: 'range' });
    expect(tokenize('A1 : B3')[0]).toMatchObject({ type: 'range' });
  });

  it('reads a name followed by a paren as a function, not a reference', () => {
    expect(types('LOG10(100)')).toEqual(['ident', 'lparen', 'number', 'rparen']);
    expect(types('A1(2)')).toEqual(['ident', 'lparen', 'number', 'rparen']);
  });

  it('reads a reference glued to an operator', () => {
    expect(types('A1+B2')).toEqual(['ref', 'op', 'ref']);
  });

  it('reads every operator', () => {
    expect(types('1+2-3*4/5^6&7')).toEqual([
      'number', 'op', 'number', 'op', 'number', 'op', 'number', 'op',
      'number', 'op', 'number', 'op', 'number',
    ]);
    expect(types('1<>2')).toEqual(['number', 'op', 'number']);
    expect(types('1<=2')).toEqual(['number', 'op', 'number']);
    expect(types('1>=2')).toEqual(['number', 'op', 'number']);
    expect(types('50%')).toEqual(['number', 'op']);
  });

  it('reads error literals', () => {
    expect(tokenize('#N/A')[0]).toMatchObject({ type: 'error', code: '#N/A' });
    expect(tokenize('#DIV/0!')[0]).toMatchObject({ type: 'error', code: '#DIV/0!' });
  });

  it('records token spans', () => {
    expect(tokenize('  A1')[0]).toMatchObject({ start: 2, end: 4 });
  });

  it('rejects stray characters', () => {
    expect(() => tokenize('@')).toThrow(ParseError);
  });
});

describe('parser', () => {
  const parse = (src: string) => parseFormula(src);

  it('parses with or without the leading =', () => {
    expect(parse('=1')).toEqual({ type: 'number', value: 1 });
    expect(parse('1')).toEqual({ type: 'number', value: 1 });
  });

  it('applies * before +', () => {
    const ast = parse('=1+2*3') as Extract<Node, { type: 'binary' }>;
    expect(ast.op).toBe('+');
    expect(ast.right).toMatchObject({ type: 'binary', op: '*' });
  });

  it('keeps + left-associative', () => {
    const ast = parse('=1-2-3') as Extract<Node, { type: 'binary' }>;
    expect(ast.op).toBe('-');
    expect(ast.left).toMatchObject({ type: 'binary', op: '-' });
    expect(ast.right).toMatchObject({ type: 'number', value: 3 });
  });

  it('honours parentheses', () => {
    const ast = parse('=(1+2)*3') as Extract<Node, { type: 'binary' }>;
    expect(ast.op).toBe('*');
    expect(ast.left).toMatchObject({ type: 'binary', op: '+' });
  });

  it('puts comparison below concatenation', () => {
    const ast = parse('="a"&"b"="ab"') as Extract<Node, { type: 'binary' }>;
    expect(ast.op).toBe('=');
    expect(ast.left).toMatchObject({ type: 'binary', op: '&' });
  });

  it('parses unary minus', () => {
    expect(parse('=-5')).toEqual({ type: 'unary', op: '-', operand: { type: 'number', value: 5 } });
    expect(parse('=--5')).toMatchObject({ type: 'unary', operand: { type: 'unary' } });
  });

  it('parses a percent suffix', () => {
    expect(parse('=50%')).toEqual({ type: 'percent', operand: { type: 'number', value: 50 } });
  });

  it('parses a call with comma arguments', () => {
    const ast = parse('=SUM(1, 2, 3)') as Extract<Node, { type: 'call' }>;
    expect(ast.name).toBe('SUM');
    expect(ast.args).toHaveLength(3);
  });

  it('parses a call with no arguments', () => {
    expect(parse('=PI()')).toEqual({ type: 'call', name: 'PI', args: [] });
  });

  it('parses nested calls with ranges', () => {
    const ast = parse('=IF(SUM(A1:B3)>10,"big","small")') as Extract<Node, { type: 'call' }>;
    expect(ast.name).toBe('IF');
    expect(ast.args[0]).toMatchObject({ type: 'binary', op: '>' });
    expect(ast.args).toHaveLength(3);
  });

  it('upper-cases function names', () => {
    expect(parse('=sum(1)')).toMatchObject({ name: 'SUM' });
  });

  it('reads an empty argument as blank text', () => {
    const ast = parse('=IF(A1,,"x")') as Extract<Node, { type: 'call' }>;
    expect(ast.args[1]).toEqual({ type: 'string', value: '' });
  });

  it('rejects unbalanced parentheses', () => {
    expect(() => parse('=(1+2')).toThrow(ParseError);
    expect(() => parse('=SUM(1')).toThrow(ParseError);
  });

  it('rejects a bare name', () => {
    expect(() => parse('=FOO')).toThrow(ParseError);
  });

  it('rejects trailing junk', () => {
    expect(() => parse('=1 2')).toThrow(ParseError);
  });

  it('rejects an empty formula', () => {
    expect(() => parse('=')).toThrow(ParseError);
  });

  it('reports the position of the error', () => {
    try {
      parse('=1+@');
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).position).toBe(3);
    }
  });
});

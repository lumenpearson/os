import { describe, expect, it } from 'vitest';
import {
  adjustFormula,
  type Cells,
  evaluateFormula,
  evaluateSheet,
  formulaReferences,
  formulaSyntaxError,
  isFormula,
  shiftFormula,
} from './evaluate';
import { CellError, dateToSerial, type Scalar, ymdToSerial } from './values';

const FIXED_NOW = new Date(2024, 4, 17, 9, 30, 0);
const options = { now: () => FIXED_NOW, random: () => 0.5, locale: 'en-US' };

/** The value of a formula, evaluated against an optional sheet. */
function ev(formula: string, cells: Cells = {}): Scalar {
  return evaluateFormula(formula, cells, options);
}

/** The error code a formula produces, or null. */
function err(formula: string, cells: Cells = {}): string | null {
  const v = ev(formula, cells);
  return v instanceof CellError ? v.code : null;
}

describe('literals and cell values', () => {
  it('keeps plain values as they are', () => {
    const r = evaluateSheet({ A1: 'Item', B1: 12 }, options);
    expect(r.get('A1')?.value).toBe('Item');
    expect(r.get('B1')?.value).toBe(12);
  });

  it('reads an empty cell as blank', () => {
    expect(ev('=A1')).toBeNull();
  });

  it('evaluates literals', () => {
    expect(ev('=42')).toBe(42);
    expect(ev('="hi"')).toBe('hi');
    expect(ev('=TRUE')).toBe(true);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, multiplies and divides', () => {
    expect(ev('=1+2')).toBe(3);
    expect(ev('=5-8')).toBe(-3);
    expect(ev('=6*7')).toBe(42);
    expect(ev('=9/2')).toBe(4.5);
  });

  it('raises to a power, right of unary minus', () => {
    expect(ev('=2^10')).toBe(1024);
    expect(ev('=-2^2')).toBe(4);
  });

  it('applies precedence and parentheses', () => {
    expect(ev('=1+2*3')).toBe(7);
    expect(ev('=(1+2)*3')).toBe(9);
    expect(ev('=2*3+4*5')).toBe(26);
  });

  it('reads a percent suffix', () => {
    expect(ev('=50%')).toBe(0.5);
    expect(ev('=200*10%')).toBe(20);
  });

  it('divides by zero into #DIV/0!', () => {
    expect(err('=1/0')).toBe('#DIV/0!');
    expect(err('=1/A1')).toBe('#DIV/0!');
  });

  it('reports #NUM! for an impossible power', () => {
    expect(err('=(-8)^0.5')).toBe('#NUM!');
  });
});

describe('coercion', () => {
  it('treats an empty cell as 0 in arithmetic', () => {
    expect(ev('=A1+5')).toBe(5);
    expect(ev('=A1*3')).toBe(0);
  });

  it('reads numeric text as a number', () => {
    expect(ev('=A1+1', { A1: '41' })).toBe(42);
    expect(ev('=A1*2', { A1: ' 2.5 ' })).toBe(5);
  });

  it('refuses text that is not a number', () => {
    expect(err('=A1+1', { A1: 'apple' })).toBe('#VALUE!');
  });

  it('counts TRUE as 1', () => {
    expect(ev('=TRUE+1')).toBe(2);
    expect(ev('=FALSE+1')).toBe(1);
  });

  it('concatenates with &', () => {
    expect(ev('="a"&"b"')).toBe('ab');
    expect(ev('=A1&B1', { A1: 'Total: ', B1: 12 })).toBe('Total: 12');
    expect(ev('=A1&"x"')).toBe('x');
  });

  it('concatenates numbers without float noise', () => {
    expect(ev('=(0.1+0.2)&""')).toBe('0.3');
  });
});

describe('comparison', () => {
  it('compares numbers', () => {
    expect(ev('=1<2')).toBe(true);
    expect(ev('=2<=2')).toBe(true);
    expect(ev('=3>4')).toBe(false);
    expect(ev('=3<>4')).toBe(true);
    expect(ev('=3=3')).toBe(true);
  });

  it('compares text case-insensitively', () => {
    expect(ev('="abc"="ABC"')).toBe(true);
    expect(ev('="abc"<>"ABC"')).toBe(false);
    expect(ev('="a"<"b"')).toBe(true);
  });

  it('sorts numbers before text', () => {
    expect(ev('=1<"a"')).toBe(true);
  });

  it('compares a blank cell as zero or empty text', () => {
    expect(ev('=A1=0')).toBe(true);
    expect(ev('=A1=""')).toBe(true);
  });
});

describe('ranges', () => {
  const sheet: Cells = { A1: 1, A2: 2, A3: 3, B1: 4, B2: 5, B3: 6 };

  it('sums a column', () => {
    expect(ev('=SUM(A1:A3)', sheet)).toBe(6);
  });

  it('sums a rectangle', () => {
    expect(ev('=SUM(A1:B3)', sheet)).toBe(21);
  });

  it('skips blanks and text in aggregates', () => {
    expect(ev('=SUM(A1:A4)', { A1: 1, A3: 2, A4: 'text' })).toBe(3);
    expect(ev('=AVERAGE(A1:A4)', { A1: 2, A3: 4, A4: 'text' })).toBe(3);
  });

  it('propagates an error from inside a range', () => {
    expect(err('=SUM(A1:A2)', { A1: 1, A2: '=1/0' })).toBe('#DIV/0!');
  });

  it('rejects a multi-cell range where one value is needed', () => {
    expect(err('=A1:A3+1', sheet)).toBe('#VALUE!');
  });

  it('accepts a one-cell range as a value', () => {
    expect(ev('=A1:A1+1', sheet)).toBe(2);
  });
});

describe('aggregate functions', () => {
  const sheet: Cells = { A1: 5, A2: 3, A3: 9, A4: 'text', A6: 1 };

  it('SUM, MIN, MAX, AVERAGE', () => {
    expect(ev('=SUM(A1:A6)', sheet)).toBe(18);
    expect(ev('=MIN(A1:A6)', sheet)).toBe(1);
    expect(ev('=MAX(A1:A6)', sheet)).toBe(9);
    expect(ev('=AVERAGE(A1:A3)', sheet)).toBe(17 / 3);
  });

  it('AVERAGE of nothing is #DIV/0!', () => {
    expect(err('=AVERAGE(A1:A3)')).toBe('#DIV/0!');
  });

  it('COUNT counts numbers, COUNTA counts non-blanks', () => {
    expect(ev('=COUNT(A1:A6)', sheet)).toBe(4);
    expect(ev('=COUNTA(A1:A6)', sheet)).toBe(5);
  });

  it('MEDIAN takes the middle', () => {
    expect(ev('=MEDIAN(A1:A3)', sheet)).toBe(5);
    expect(ev('=MEDIAN(1,2,3,4)')).toBe(2.5);
  });

  it('PRODUCT multiplies', () => {
    expect(ev('=PRODUCT(A1:A3)', sheet)).toBe(135);
  });

  it('coerces direct text arguments but not cells', () => {
    expect(ev('=SUM("3",4)')).toBe(7);
    expect(ev('=SUM(A1:A1)', { A1: '3' })).toBe(0);
  });
});

describe('COUNTIF and SUMIF', () => {
  const sheet: Cells = {
    A1: 5,
    A2: 12,
    A3: 3,
    A4: 12,
    B1: 'apple',
    B2: 'banana',
    B3: 'apple',
    B4: 'cherry',
  };

  it('counts with a comparison criterion', () => {
    expect(ev('=COUNTIF(A1:A4,">5")', sheet)).toBe(2);
    expect(ev('=COUNTIF(A1:A4,">=5")', sheet)).toBe(3);
    expect(ev('=COUNTIF(A1:A4,"<5")', sheet)).toBe(1);
  });

  it('counts with an equality criterion', () => {
    expect(ev('=COUNTIF(A1:A4,12)', sheet)).toBe(2);
    expect(ev('=COUNTIF(A1:A4,"12")', sheet)).toBe(2);
    expect(ev('=COUNTIF(A1:A4,"<>12")', sheet)).toBe(2);
  });

  it('counts text, case-insensitively', () => {
    expect(ev('=COUNTIF(B1:B4,"apple")', sheet)).toBe(2);
    expect(ev('=COUNTIF(B1:B4,"APPLE")', sheet)).toBe(2);
  });

  it('counts with wildcards', () => {
    expect(ev('=COUNTIF(B1:B4,"a*")', sheet)).toBe(2);
    expect(ev('=COUNTIF(B1:B4,"?a*")', sheet)).toBe(1);
  });

  it('sums the matching cells of the same range', () => {
    expect(ev('=SUMIF(A1:A4,">5")', sheet)).toBe(24);
  });

  it('sums a parallel range', () => {
    expect(ev('=SUMIF(B1:B4,"apple",A1:A4)', sheet)).toBe(8);
  });

  it('averages the matching cells', () => {
    expect(ev('=AVERAGEIF(A1:A4,">4")', sheet)).toBe(29 / 3);
  });
});

describe('IF and logic', () => {
  it('picks a branch', () => {
    expect(ev('=IF(1>0,"yes","no")')).toBe('yes');
    expect(ev('=IF(1<0,"yes","no")')).toBe('no');
  });

  it('defaults the missing else to FALSE', () => {
    expect(ev('=IF(1<0,"yes")')).toBe(false);
  });

  it('nests', () => {
    const grade = (score: number) =>
      ev('=IF(A1>=90,"A",IF(A1>=80,"B",IF(A1>=70,"C","F")))', { A1: score });
    expect(grade(95)).toBe('A');
    expect(grade(85)).toBe('B');
    expect(grade(75)).toBe('C');
    expect(grade(20)).toBe('F');
  });

  it('does not take the error of the branch it skips', () => {
    expect(ev('=IF(TRUE,1,1/0)')).toBe(1);
  });

  it('IFERROR replaces an error', () => {
    expect(ev('=IFERROR(1/0,"n/a")')).toBe('n/a');
    expect(ev('=IFERROR(4/2,"n/a")')).toBe(2);
    expect(ev('=IFERROR(A1+1,0)', { A1: 'text' })).toBe(0);
  });

  it('AND, OR, NOT', () => {
    expect(ev('=AND(TRUE,TRUE)')).toBe(true);
    expect(ev('=AND(TRUE,FALSE)')).toBe(false);
    expect(ev('=OR(FALSE,TRUE)')).toBe(true);
    expect(ev('=OR(FALSE,FALSE)')).toBe(false);
    expect(ev('=NOT(TRUE)')).toBe(false);
    expect(ev('=AND(A1>0,A1<10)', { A1: 5 })).toBe(true);
  });
});

describe('math functions', () => {
  it('rounds', () => {
    expect(ev('=ROUND(3.14159,2)')).toBe(3.14);
    expect(ev('=ROUND(2.5)')).toBe(3);
    expect(ev('=ROUND(-2.5)')).toBe(-3);
    expect(ev('=ROUND(1234.5678,-2)')).toBe(1200);
  });

  it('rounds up and down away from and towards zero', () => {
    expect(ev('=ROUNDUP(3.01,1)')).toBe(3.1);
    expect(ev('=ROUNDUP(-3.01,1)')).toBe(-3.1);
    expect(ev('=ROUNDDOWN(3.99,1)')).toBe(3.9);
    expect(ev('=ROUNDDOWN(-3.99,1)')).toBe(-3.9);
  });

  it('ABS, SQRT, POWER, INT', () => {
    expect(ev('=ABS(-7)')).toBe(7);
    expect(ev('=SQRT(81)')).toBe(9);
    expect(ev('=POWER(3,4)')).toBe(81);
    expect(ev('=INT(3.9)')).toBe(3);
    expect(ev('=INT(-3.1)')).toBe(-4);
  });

  it('SQRT of a negative is #NUM!', () => {
    expect(err('=SQRT(-1)')).toBe('#NUM!');
  });

  it('MOD takes the sign of the divisor', () => {
    expect(ev('=MOD(10,3)')).toBe(1);
    expect(ev('=MOD(-1,3)')).toBe(2);
    expect(err('=MOD(1,0)')).toBe('#DIV/0!');
  });

  it('PI is a constant', () => {
    expect(ev('=PI()')).toBeCloseTo(Math.PI, 12);
    expect(ev('=ROUND(PI(),4)')).toBe(Math.round(Math.PI * 1e4) / 1e4);
  });

  it('RAND and RANDBETWEEN use the injected source', () => {
    expect(ev('=RAND()')).toBe(0.5);
    expect(ev('=RANDBETWEEN(1,10)')).toBe(6);
    expect(err('=RANDBETWEEN(10,1)')).toBe('#NUM!');
  });
});

describe('text functions', () => {
  it('LEN, UPPER, LOWER, TRIM', () => {
    expect(ev('=LEN("hello")')).toBe(5);
    expect(ev('=UPPER("abc")')).toBe('ABC');
    expect(ev('=LOWER("ABC")')).toBe('abc');
    expect(ev('=TRIM("  a   b  ")')).toBe('a b');
  });

  it('LEN of a number counts its digits', () => {
    expect(ev('=LEN(A1)', { A1: 1234 })).toBe(4);
  });

  it('CONCAT and CONCATENATE join', () => {
    expect(ev('=CONCAT("a","b","c")')).toBe('abc');
    expect(ev('=CONCATENATE(A1," ",A2)', { A1: 'Ada', A2: 'Lovelace' })).toBe('Ada Lovelace');
    expect(ev('=CONCAT(A1:A3)', { A1: 'a', A2: 'b', A3: 'c' })).toBe('abc');
  });

  it('LEFT, RIGHT, MID', () => {
    expect(ev('=LEFT("spreadsheet",6)')).toBe('spread');
    expect(ev('=RIGHT("spreadsheet",5)')).toBe('sheet');
    expect(ev('=MID("spreadsheet",7,5)')).toBe('sheet');
    expect(ev('=LEFT("abc")')).toBe('a');
    expect(ev('=RIGHT("abc",0)')).toBe('');
  });

  it('TEXT formats numbers and dates', () => {
    expect(ev('=TEXT(3.14159,"0.00")')).toBe('3.14');
    expect(ev('=TEXT(1234567,"#,##0")')).toBe('1,234,567');
    expect(ev('=TEXT(0.256,"0%")')).toBe('26%');
    expect(ev(`=TEXT(DATE(2024,5,17),"yyyy-mm-dd")`)).toBe('2024-05-17');
  });

  it('SUBSTITUTE and FIND', () => {
    expect(ev('=SUBSTITUTE("a-b-c","-","+")')).toBe('a+b+c');
    expect(ev('=SUBSTITUTE("a-b-c","-","+",2)')).toBe('a-b+c');
    expect(ev('=FIND("b","abc")')).toBe(2);
    expect(err('=FIND("z","abc")')).toBe('#VALUE!');
  });
});

describe('date functions', () => {
  it('DATE builds a serial that YEAR/MONTH/DAY read back', () => {
    expect(ev('=DATE(2024,5,17)')).toBe(ymdToSerial(2024, 5, 17));
    expect(ev('=YEAR(DATE(2024,5,17))')).toBe(2024);
    expect(ev('=MONTH(DATE(2024,5,17))')).toBe(5);
    expect(ev('=DAY(DATE(2024,5,17))')).toBe(17);
  });

  it('overflows months and days', () => {
    expect(ev('=MONTH(DATE(2024,13,1))')).toBe(1);
    expect(ev('=YEAR(DATE(2024,13,1))')).toBe(2025);
    expect(ev('=DAY(DATE(2024,2,30))')).toBe(1);
  });

  it('reads an ISO date from a cell', () => {
    expect(ev('=YEAR(A1)', { A1: '2023-11-02' })).toBe(2023);
    expect(ev('=MONTH(A1)', { A1: '2023-11-02' })).toBe(11);
    expect(ev('=DAY(A1)', { A1: '2023-11-02' })).toBe(2);
  });

  it('subtracts dates into a day count', () => {
    expect(ev('=DATE(2024,5,17)-DATE(2024,5,10)')).toBe(7);
  });

  it('TODAY and NOW use the injected clock', () => {
    expect(ev('=TODAY()')).toBe(Math.floor(dateToSerial(FIXED_NOW)));
    expect(ev('=NOW()')).toBe(dateToSerial(FIXED_NOW));
    expect(ev('=YEAR(TODAY())')).toBe(2024);
  });

  it('WEEKDAY counts from Sunday or Monday', () => {
    expect(ev('=WEEKDAY(DATE(2024,5,17))')).toBe(6);
    expect(ev('=WEEKDAY(DATE(2024,5,17),2)')).toBe(5);
  });
});

describe('lookup functions', () => {
  const table: Cells = {
    A1: 'apple',
    B1: 1.2,
    C1: 'red',
    A2: 'banana',
    B2: 0.5,
    C2: 'yellow',
    A3: 'cherry',
    B3: 4,
    C3: 'red',
  };

  it('VLOOKUP finds an exact match', () => {
    expect(ev('=VLOOKUP("banana",A1:C3,2)', table)).toBe(0.5);
    expect(ev('=VLOOKUP("cherry",A1:C3,3)', table)).toBe('red');
  });

  it('VLOOKUP matches case-insensitively', () => {
    expect(ev('=VLOOKUP("BANANA",A1:C3,2)', table)).toBe(0.5);
  });

  it('VLOOKUP without a match is #N/A', () => {
    expect(err('=VLOOKUP("durian",A1:C3,2)', table)).toBe('#N/A');
  });

  it('VLOOKUP past the last column is #REF!', () => {
    expect(err('=VLOOKUP("apple",A1:C3,9)', table)).toBe('#REF!');
  });

  it('VLOOKUP approximates on a sorted range', () => {
    const sorted: Cells = { A1: 0, B1: 'F', A2: 70, B2: 'C', A3: 80, B3: 'B', A4: 90, B4: 'A' };
    expect(ev('=VLOOKUP(85,A1:B4,2,TRUE)', sorted)).toBe('B');
    expect(ev('=VLOOKUP(90,A1:B4,2,TRUE)', sorted)).toBe('A');
    expect(ev('=VLOOKUP(12,A1:B4,2,TRUE)', sorted)).toBe('F');
  });

  it('INDEX reads a cell of the range', () => {
    expect(ev('=INDEX(A1:C3,2,3)', table)).toBe('yellow');
    expect(ev('=INDEX(A1:A3,3)', table)).toBe('cherry');
    expect(err('=INDEX(A1:C3,9,1)', table)).toBe('#REF!');
  });

  it('MATCH finds a position', () => {
    expect(ev('=MATCH("cherry",A1:A3,0)', table)).toBe(3);
    expect(err('=MATCH("durian",A1:A3,0)', table)).toBe('#N/A');
  });

  it('INDEX with MATCH looks a row up', () => {
    expect(ev('=INDEX(C1:C3,MATCH("banana",A1:A3,0),1)', table)).toBe('yellow');
  });
});

describe('errors', () => {
  it('reports an unknown function as #NAME?', () => {
    expect(err('=NOSUCHFN(1)')).toBe('#NAME?');
  });

  it('reports a broken formula as #ERROR!', () => {
    expect(err('=1+')).toBe('#ERROR!');
    expect(err('=SUM(')).toBe('#ERROR!');
  });

  it('keeps an error literal', () => {
    expect(err('=#N/A')).toBe('#N/A');
  });

  it('propagates an error through arithmetic', () => {
    expect(err('=A1+1', { A1: '=1/0' })).toBe('#DIV/0!');
    expect(err('=SUM(A1:A2)+1', { A1: '=NOSUCHFN()', A2: 1 })).toBe('#NAME?');
  });

  it('takes the first error of a binary operation', () => {
    expect(err('=A1+A2', { A1: '=1/0', A2: '=NOSUCHFN()' })).toBe('#DIV/0!');
  });

  it('detects a wrong argument count', () => {
    expect(err('=ABS()')).toBe('#VALUE!');
    expect(err('=ABS(1,2)')).toBe('#VALUE!');
  });

  it('ISERROR sees the error', () => {
    expect(ev('=ISERROR(1/0)')).toBe(true);
    expect(ev('=ISERROR(1)')).toBe(false);
  });
});

describe('cycles', () => {
  it('flags a direct self-reference', () => {
    const r = evaluateSheet({ A1: '=A1+1' }, options);
    expect(r.get('A1')?.error).toBe('#CYCLE!');
  });

  it('flags a two-cell cycle', () => {
    const r = evaluateSheet({ A1: '=B1', B1: '=A1' }, options);
    expect(r.get('A1')?.error).toBe('#CYCLE!');
    expect(r.get('B1')?.error).toBe('#CYCLE!');
  });

  it('flags a longer cycle', () => {
    const r = evaluateSheet({ A1: '=B1+1', B1: '=C1+1', C1: '=A1+1' }, options);
    expect(r.get('A1')?.error).toBe('#CYCLE!');
  });

  it('flags a cycle through a range', () => {
    const r = evaluateSheet({ A1: 1, A2: 2, A3: '=SUM(A1:A3)' }, options);
    expect(r.get('A3')?.error).toBe('#CYCLE!');
  });

  it('leaves cells outside the cycle alone', () => {
    const r = evaluateSheet({ A1: '=B1', B1: '=A1', C1: '=1+1' }, options);
    expect(r.get('C1')?.value).toBe(2);
    expect(r.get('C1')?.error).toBeNull();
  });

  it('does not mistake a diamond for a cycle', () => {
    const r = evaluateSheet({ A1: 1, B1: '=A1+1', C1: '=A1+2', D1: '=B1+C1' }, options);
    expect(r.get('D1')?.value).toBe(5);
    expect(r.get('D1')?.error).toBeNull();
  });
});

describe('evaluateSheet', () => {
  it('resolves a chain of dependencies', () => {
    const r = evaluateSheet({ A1: 2, A2: '=A1*3', A3: '=A2+4', A4: '=A3/2' }, options);
    expect(r.get('A2')?.value).toBe(6);
    expect(r.get('A3')?.value).toBe(10);
    expect(r.get('A4')?.value).toBe(5);
  });

  it('computes the seeded budget sheet', () => {
    const budget: Cells = {
      A1: 'Item',
      B1: 'Planned',
      C1: 'Actual',
      A2: 'Rent',
      B2: 1200,
      C2: 1200,
      A3: 'Groceries',
      B3: 420,
      C3: 388,
      A4: 'Transport',
      B4: 90,
      C4: 104,
      A5: 'Total',
      B5: '=SUM(B2:B4)',
      C5: '=SUM(C2:C4)',
      A7: 'Difference',
      B7: '=B5-C5',
    };
    const r = evaluateSheet(budget, options);
    expect(r.get('B5')?.value).toBe(1710);
    expect(r.get('C5')?.value).toBe(1692);
    expect(r.get('B7')?.value).toBe(18);
  });

  it('records an error code beside the value', () => {
    const r = evaluateSheet({ A1: '=1/0' }, options);
    expect(r.get('A1')?.error).toBe('#DIV/0!');
    expect(r.get('A1')?.value).toBeInstanceOf(CellError);
  });

  it('has an entry for every cell', () => {
    const r = evaluateSheet({ A1: 1, B2: 'x', C3: '=A1' }, options);
    expect([...r.keys()].sort()).toEqual(['A1', 'B2', 'C3']);
  });

  it('evaluates a shared dependency once', () => {
    let calls = 0;
    const random = () => {
      calls++;
      return 0.25;
    };
    const r = evaluateSheet({ A1: '=RAND()', B1: '=A1', C1: '=A1' }, { ...options, random });
    expect(calls).toBe(1);
    expect(r.get('B1')?.value).toBe(0.25);
    expect(r.get('C1')?.value).toBe(0.25);
  });
});

describe('isFormula', () => {
  it('recognises a formula', () => {
    expect(isFormula('=1+1')).toBe(true);
    expect(isFormula('1+1')).toBe(false);
    expect(isFormula('=')).toBe(false);
    expect(isFormula(12)).toBe(false);
  });
});

describe('formulaSyntaxError', () => {
  it('is null for a good formula', () => {
    expect(formulaSyntaxError('=SUM(A1:A3)')).toBeNull();
  });

  it('reports a broken one', () => {
    expect(formulaSyntaxError('=SUM(')).not.toBeNull();
  });
});

describe('shiftFormula', () => {
  it('moves relative references', () => {
    expect(shiftFormula('=A1', 1, 0)).toBe('=A2');
    expect(shiftFormula('=A1', 0, 1)).toBe('=B1');
    expect(shiftFormula('=A1+B2', 2, 1)).toBe('=B3+C4');
  });

  it('leaves absolute parts alone', () => {
    expect(shiftFormula('=$A$1', 3, 3)).toBe('=$A$1');
    expect(shiftFormula('=$A1', 1, 1)).toBe('=$A2');
    expect(shiftFormula('=A$1', 1, 1)).toBe('=B$1');
  });

  it('moves ranges', () => {
    expect(shiftFormula('=SUM(A1:A3)', 1, 0)).toBe('=SUM(A2:A4)');
    expect(shiftFormula('=SUM(A$1:A$3)', 5, 1)).toBe('=SUM(B$1:B$3)');
  });

  it('keeps the rest of the formula', () => {
    expect(shiftFormula('=IF(A1>0,"up","down")', 1, 0)).toBe('=IF(A2>0,"up","down")');
    expect(shiftFormula('=SUM(A1:A3)/COUNT(A1:A3)', 0, 1)).toBe('=SUM(B1:B3)/COUNT(B1:B3)');
  });

  it('does not touch a reference inside a string', () => {
    expect(shiftFormula('="A1"&A1', 1, 0)).toBe('="A1"&A2');
  });

  it('turns an off-sheet reference into #REF!', () => {
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!');
    expect(shiftFormula('=A1', 0, -1)).toBe('=#REF!');
  });

  it('returns non-formulas and zero shifts unchanged', () => {
    expect(shiftFormula('text', 1, 1)).toBe('text');
    expect(shiftFormula('=A1', 0, 0)).toBe('=A1');
  });

  it('leaves a broken formula alone', () => {
    expect(shiftFormula('=A1+"', 1, 0)).toBe('=A1+"');
  });

  it('keeps the fill result consistent', () => {
    const filled = shiftFormula('=SUM(B2:B4)', 1, 0);
    expect(filled).toBe('=SUM(B3:B5)');
    expect(evaluateFormula(filled, { B3: 1, B4: 2, B5: 3 }, options)).toBe(6);
  });
});

describe('adjustFormula', () => {
  it('moves references down when a row is inserted above', () => {
    expect(adjustFormula('=A5', { axis: 'row', kind: 'insert', at: 0, count: 1 })).toBe('=A6');
    expect(adjustFormula('=A5', { axis: 'row', kind: 'insert', at: 9, count: 1 })).toBe('=A5');
  });

  it('moves absolute references too', () => {
    expect(adjustFormula('=$A$5', { axis: 'row', kind: 'insert', at: 0, count: 1 })).toBe('=$A$6');
  });

  it('moves references right when a column is inserted', () => {
    expect(adjustFormula('=C1', { axis: 'col', kind: 'insert', at: 0, count: 1 })).toBe('=D1');
  });

  it('grows a range when a row is inserted inside it', () => {
    expect(adjustFormula('=SUM(B2:B4)', { axis: 'row', kind: 'insert', at: 2, count: 1 })).toBe(
      '=SUM(B2:B5)',
    );
  });

  it('does not grow a range when a row is inserted after it', () => {
    expect(adjustFormula('=SUM(B2:B4)', { axis: 'row', kind: 'insert', at: 4, count: 1 })).toBe(
      '=SUM(B2:B4)',
    );
  });

  it('shrinks a range when a row inside it is deleted', () => {
    expect(adjustFormula('=SUM(B2:B4)', { axis: 'row', kind: 'delete', at: 2, count: 1 })).toBe(
      '=SUM(B2:B3)',
    );
  });

  it('moves a range up when a row above it is deleted', () => {
    expect(adjustFormula('=SUM(B5:B7)', { axis: 'row', kind: 'delete', at: 0, count: 1 })).toBe(
      '=SUM(B4:B6)',
    );
  });

  it('breaks a reference to a deleted cell', () => {
    expect(adjustFormula('=A5', { axis: 'row', kind: 'delete', at: 4, count: 1 })).toBe('=#REF!');
    expect(adjustFormula('=SUM(B2:B3)', { axis: 'row', kind: 'delete', at: 1, count: 2 })).toBe(
      '=SUM(#REF!)',
    );
  });

  it('deletes a column out of a range', () => {
    expect(adjustFormula('=SUM(A1:C1)', { axis: 'col', kind: 'delete', at: 1, count: 1 })).toBe(
      '=SUM(A1:B1)',
    );
  });
});

describe('formulaReferences', () => {
  it('lists the cells and ranges a formula reads', () => {
    const refs = formulaReferences('=SUM(A1:B3)+C4');
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ start: { col: 0, row: 0 }, end: { col: 1, row: 2 } });
    expect(refs[1]).toMatchObject({ start: { col: 2, row: 3 }, end: { col: 2, row: 3 } });
  });

  it('is empty for a formula without references or a broken one', () => {
    expect(formulaReferences('=1+2')).toEqual([]);
    expect(formulaReferences('=A1+"')).toEqual([]);
  });
});

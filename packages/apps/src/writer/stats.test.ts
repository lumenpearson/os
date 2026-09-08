import { describe, expect, it } from 'vitest';
import { countWords, htmlToPlainText, readingMinutes, textStats, WORDS_PER_MINUTE } from './stats';

describe('countWords', () => {
  it('counts words separated by any whitespace', () => {
    expect(countWords('one two\tthree\nfour')).toBe(4);
  });

  it('ignores leading, trailing and repeated spaces', () => {
    expect(countWords('   spaced    out   ')).toBe(2);
  });

  it('treats a non-breaking space as a separator', () => {
    expect(countWords(`one${String.fromCharCode(160)}two`)).toBe(2);
  });

  it('is zero for nothing', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
});

describe('readingMinutes', () => {
  it('is zero without words', () => {
    expect(readingMinutes(0)).toBe(0);
  });

  it('rounds a short document up to one minute', () => {
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(WORDS_PER_MINUTE)).toBe(1);
  });

  it('rounds up to whole minutes', () => {
    expect(readingMinutes(WORDS_PER_MINUTE + 1)).toBe(2);
    expect(readingMinutes(1000, 200)).toBe(5);
  });
});

describe('textStats', () => {
  it('reports words, characters and reading time', () => {
    expect(textStats('Hello there, writer.')).toEqual({
      words: 3,
      characters: 20,
      charactersNoSpaces: 18,
      minutes: 1,
    });
  });

  it('is all zeroes for an empty document', () => {
    expect(textStats('')).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      minutes: 0,
    });
  });
});

describe('htmlToPlainText', () => {
  it('separates blocks with a blank line', () => {
    expect(htmlToPlainText('<h1>Title</h1><p>Body</p>')).toBe('Title\n\nBody');
  });

  it('keeps list items on their own lines', () => {
    expect(htmlToPlainText('<ul><li>one</li><li>two</li></ul>')).toBe('one\ntwo');
  });

  it('indents a nested list', () => {
    expect(htmlToPlainText('<ul><li>one<ul><li>deep</li></ul></li></ul>')).toBe('one\n  deep');
  });

  it('drops inline tags but keeps their text', () => {
    expect(htmlToPlainText('<p>a <strong>bold</strong> word</p>')).toBe('a bold word');
  });

  it('keeps the whitespace inside a code block', () => {
    expect(htmlToPlainText('<pre><code>if (x) {\n  go();\n}</code></pre>')).toBe(
      'if (x) {\n  go();\n}',
    );
  });

  it('breaks a line at a br', () => {
    expect(htmlToPlainText('<p>one<br>two</p>')).toBe('one\ntwo');
  });

  it('writes a horizontal rule as three dashes', () => {
    expect(htmlToPlainText('<p>a</p><hr><p>b</p>')).toBe('a\n\n---\n\nb');
  });

  it('is empty for an empty document', () => {
    expect(htmlToPlainText('<p><br></p>')).toBe('');
  });
});

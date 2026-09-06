// deslop-ignore-file 09 - the <s> and <u> tags under test are editor commands
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './markdown';

describe('htmlToMarkdown', () => {
  it('writes headings at their level', () => {
    expect(htmlToMarkdown('<h1>Title</h1><h2>Sub</h2><h3>Deep</h3>')).toBe(
      '# Title\n\n## Sub\n\n### Deep\n',
    );
  });

  it('marks bold, italic and strikethrough', () => {
    expect(htmlToMarkdown('<p><strong>bold</strong> <em>italic</em> <s>gone</s></p>')).toBe(
      '**bold** *italic* ~~gone~~\n',
    );
  });

  it('keeps emphasis markers against the text', () => {
    expect(htmlToMarkdown('<p>a <b> bold </b>b</p>')).toBe('a **bold** b\n');
  });

  it('writes links', () => {
    expect(htmlToMarkdown('<p>See <a href="https://lumen.test">the docs</a>.</p>')).toBe(
      'See [the docs](https://lumen.test).\n',
    );
  });

  it('writes bulleted and numbered lists', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two\n');
    expect(htmlToMarkdown('<ol><li>one</li><li>two</li></ol>')).toBe('1. one\n2. two\n');
  });

  it('indents a nested list under its item', () => {
    const html = '<ul><li>one<ul><li>deep</li></ul></li><li>two</li></ul>';
    expect(htmlToMarkdown(html)).toBe('- one\n  - deep\n- two\n');
  });

  it('quotes every line of a blockquote', () => {
    expect(htmlToMarkdown('<blockquote><p>one</p><p>two</p></blockquote>')).toBe(
      '> one\n>\n> two\n',
    );
  });

  it('fences a code block and keeps its whitespace', () => {
    expect(htmlToMarkdown('<pre><code>const a = 1;\n  const b = 2;</code></pre>')).toBe(
      '```\nconst a = 1;\n  const b = 2;\n```\n',
    );
  });

  it('writes inline code with backticks', () => {
    expect(htmlToMarkdown('<p>Run <code>pnpm test</code>.</p>')).toBe('Run `pnpm test`.\n');
  });

  it('writes a horizontal rule', () => {
    expect(htmlToMarkdown('<p>a</p><hr><p>b</p>')).toBe('a\n\n---\n\nb\n');
  });

  it('escapes characters that would read as syntax', () => {
    expect(htmlToMarkdown('<p>2 * 3 and a_b and [x]</p>')).toBe('2 \\* 3 and a\\_b and \\[x\\]\n');
  });

  it('escapes a marker at the start of a line', () => {
    expect(htmlToMarkdown('<p># not a heading</p>')).toBe('\\# not a heading\n');
  });

  it('turns a line break into a hard break', () => {
    expect(htmlToMarkdown('<p>one<br>two</p>')).toBe('one  \ntwo\n');
  });

  it('returns an empty string for an empty document', () => {
    expect(htmlToMarkdown('<p><br></p>')).toBe('');
  });
});

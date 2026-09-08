import { render, screen } from '@testing-library/react';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  blocksToText,
  collectTagTokens,
  inlineText,
  type MarkdownBlock,
  type MarkdownInline,
  parseInline,
  parseMarkdown,
  renderMarkdown,
  safeHref,
  toggleTaskAt,
  toPlainText,
} from './markdown';

/** Block kinds in order, with the source line each one started on. */
const shape = (source: string) =>
  parseMarkdown(source).map((b) => [b.type, b.line] as [MarkdownBlock['type'], number]);

const text = (nodes: readonly MarkdownInline[]) => inlineText(nodes);

function firstOf<T extends MarkdownBlock['type']>(
  source: string,
  type: T,
): Extract<MarkdownBlock, { type: T }> {
  const found = parseMarkdown(source).find((b) => b.type === type);
  if (!found) throw new Error(`no ${type} block in: ${source}`);
  return found as Extract<MarkdownBlock, { type: T }>;
}

describe('block structure', () => {
  it('reads headings, paragraphs and rules with their source lines', () => {
    expect(shape('# One\n\nBody text\n\n---\n\n## Two')).toEqual([
      ['heading', 0],
      ['paragraph', 2],
      ['rule', 4],
      ['heading', 6],
    ]);
  });

  it('takes the heading level from the run of hashes and drops closing ones', () => {
    const h = firstOf('### Deep ###', 'heading');
    expect(h.level).toBe(3);
    expect(text(h.children)).toBe('Deep');
    expect(firstOf('####### seven', 'paragraph')).toBeDefined();
  });

  it('joins the lines of a paragraph and ends it at a blank line', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(text((blocks[0] as Extract<MarkdownBlock, { type: 'paragraph' }>).children)).toBe(
      'one\ntwo',
    );
  });

  it('nests quotes, lists and code inside a quote', () => {
    const quote = firstOf('> ## Title\n> - one\n> - two\n', 'quote');
    expect(quote.children.map((b) => b.type)).toEqual(['heading', 'list']);
    const list = quote.children[1] as Extract<MarkdownBlock, { type: 'list' }>;
    expect(list.items).toHaveLength(2);
    expect(list.items[1]?.line).toBe(2);
  });

  it('nests a list inside a list item and keeps file line numbers', () => {
    const list = firstOf('- outer\n  - inner\n  - inner two\n', 'list');
    expect(list.items).toHaveLength(1);
    const inner = list.items[0]?.blocks[1] as Extract<MarkdownBlock, { type: 'list' }>;
    expect(inner.type).toBe('list');
    expect(inner.items.map((i) => i.line)).toEqual([1, 2]);
  });

  it('keeps an ordered list separate from a bulleted one and remembers its start', () => {
    const blocks = parseMarkdown('3. three\n4. four\n- bullet\n');
    const ordered = blocks[0] as Extract<MarkdownBlock, { type: 'list' }>;
    expect(ordered.ordered).toBe(true);
    expect(ordered.start).toBe(3);
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false });
  });

  it('carries an indented fence inside a list item', () => {
    const list = firstOf('- item\n\n  ```\n  code\n  ```\n', 'list');
    const code = list.items[0]?.blocks[1] as Extract<MarkdownBlock, { type: 'code' }>;
    expect(code).toMatchObject({ type: 'code', value: 'code' });
  });

  it('offsets every line by lineOffset so a body under front matter maps back', () => {
    expect(parseMarkdown('# One\n\nTwo', 4).map((b) => b.line)).toEqual([4, 6]);
  });
});

describe('code fences', () => {
  it('swallows markers that would otherwise start blocks', () => {
    const blocks = parseMarkdown(
      'Before\n\n```\n# not a heading\n* not a list\n> not a quote\n```\n',
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code']);
    const code = blocks[1] as Extract<MarkdownBlock, { type: 'code' }>;
    expect(code.value).toBe('# not a heading\n* not a list\n> not a quote');
    expect(code.language).toBeNull();
  });

  it('keeps the info string as the language', () => {
    expect(firstOf('```ts\nconst a = 1;\n```', 'code')).toMatchObject({
      language: 'ts',
      value: 'const a = 1;',
    });
  });

  it('closes a tilde fence only with tildes, so backticks inside survive', () => {
    expect(firstOf('~~~\n```\ninner\n```\n~~~', 'code').value).toBe('```\ninner\n```');
  });

  it('runs an unterminated fence to the end of the document', () => {
    expect(firstOf('```\nstill code', 'code').value).toBe('still code');
  });

  it('leaves no inline markup inside code', () => {
    expect(firstOf('```\n**bold** `tick`\n```', 'code').value).toBe('**bold** `tick`');
  });
});

describe('task lists', () => {
  it('marks the state of each item and the line it sits on', () => {
    const list = firstOf('- [ ] todo\n- [x] done\n- [X] shouting\n- plain\n', 'list');
    expect(list.items.map((i) => i.checked)).toEqual([false, true, true, null]);
    expect(list.items.map((i) => i.line)).toEqual([0, 1, 2, 3]);
    const first = list.items[0]?.blocks[0];
    expect(text((first as { children: MarkdownInline[] }).children)).toBe('todo');
  });

  it('toggles the box on one source line and leaves the rest alone', () => {
    const source = '# Notes\n\n- [ ] one\n- [x] two\n';
    expect(toggleTaskAt(source, 2)).toBe('# Notes\n\n- [x] one\n- [x] two\n');
    expect(toggleTaskAt(source, 3)).toBe('# Notes\n\n- [ ] one\n- [ ] two\n');
  });

  it('toggles an indented and an ordered task', () => {
    expect(toggleTaskAt('- a\n  - [ ] b', 1)).toBe('- a\n  - [x] b');
    expect(toggleTaskAt('1. [x] a', 0)).toBe('1. [ ] a');
  });

  it('returns the text unchanged when the line is not a task', () => {
    expect(toggleTaskAt('plain\n', 0)).toBe('plain\n');
    expect(toggleTaskAt('- [ ] one\n', 9)).toBe('- [ ] one\n');
  });
});

describe('tables', () => {
  it('reads the header, the alignment row and the body', () => {
    const table = firstOf('| Name | Qty |\n| :--- | ---: |\n| Pens | 3 |\n| Ink | 1 |\n', 'table');
    expect(table.align).toEqual(['left', 'right']);
    expect(table.header.map(text)).toEqual(['Name', 'Qty']);
    expect(table.rows.map((r) => r.map(text))).toEqual([
      ['Pens', '3'],
      ['Ink', '1'],
    ]);
  });

  it('centres a :-: column and leaves a bare one unaligned', () => {
    expect(firstOf('a | b\n--- | :-:\n1 | 2\n', 'table').align).toEqual([null, 'center']);
  });

  it('keeps an escaped pipe inside a cell and pads a short row', () => {
    const table = firstOf('| a | b |\n| --- | --- |\n| x \\| y | |\n| lone |\n', 'table');
    expect(table.rows.map((r) => r.map(text))).toEqual([
      ['x | y', ''],
      ['lone', ''],
    ]);
  });

  it('needs a delimiter row: one pipe line alone stays a paragraph', () => {
    expect(shape('| a | b |\ntext\n')).toEqual([['paragraph', 0]]);
  });
});

describe('inline', () => {
  it('reads emphasis, strong, both and strikethrough', () => {
    expect(parseInline('*a*')).toEqual([
      { type: 'emphasis', children: [{ type: 'text', value: 'a' }] },
    ]);
    expect(parseInline('**a**')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'a' }] },
    ]);
    expect(parseInline('***a***')).toEqual([
      {
        type: 'strong',
        children: [{ type: 'emphasis', children: [{ type: 'text', value: 'a' }] }],
      },
    ]);
    expect(parseInline('~~a~~')).toEqual([
      { type: 'strike', children: [{ type: 'text', value: 'a' }] },
    ]);
  });

  it('leaves an underscore inside a word alone', () => {
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', value: 'snake_case_name' }]);
  });

  it('does not open emphasis on whitespace or without a close', () => {
    expect(parseInline('a * b * c')).toEqual([{ type: 'text', value: 'a * b * c' }]);
    expect(parseInline('2 * 3')).toEqual([{ type: 'text', value: '2 * 3' }]);
    expect(parseInline('*unclosed')).toEqual([{ type: 'text', value: '*unclosed' }]);
  });

  it('reads code spans, including ones holding backticks', () => {
    expect(parseInline('a `b` c')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'code', value: 'b' },
      { type: 'text', value: ' c' },
    ]);
    expect(parseInline('``a `b` c``')).toEqual([{ type: 'code', value: 'a `b` c' }]);
    expect(parseInline('` a `')).toEqual([{ type: 'code', value: 'a' }]);
  });

  it('keeps markup inside a code span literal', () => {
    expect(parseInline('`**not bold**`')).toEqual([{ type: 'code', value: '**not bold**' }]);
  });

  it('unescapes a backslashed marker and prints it as text', () => {
    expect(parseInline('\\*literal\\*')).toEqual([{ type: 'text', value: '*literal*' }]);
    expect(parseInline('a \\# b')).toEqual([{ type: 'text', value: 'a # b' }]);
    expect(parseInline('C:\\\\path')).toEqual([{ type: 'text', value: 'C:\\path' }]);
  });

  it('reads a link, its label markup and a quoted title', () => {
    expect(parseInline('[go **now**](https://lumen.test)')).toEqual([
      {
        type: 'link',
        href: 'https://lumen.test',
        children: [
          { type: 'text', value: 'go ' },
          { type: 'strong', children: [{ type: 'text', value: 'now' }] },
        ],
      },
    ]);
    expect(parseInline('[t](https://a.test "Title")')).toEqual([
      { type: 'link', href: 'https://a.test', children: [{ type: 'text', value: 't' }] },
    ]);
  });

  it('drops images rather than fetching anything', () => {
    expect(parseInline('before ![alt](https://a.test/x.png) after')).toEqual([
      { type: 'text', value: 'before  after' },
    ]);
  });
});

describe('link safety', () => {
  it('keeps only http, https and mailto', () => {
    expect(safeHref('https://a.test/x?y=1#z')).toBe('https://a.test/x?y=1#z');
    expect(safeHref('HTTP://A.TEST')).toBe('HTTP://A.TEST');
    expect(safeHref('mailto:ada@lumen.test')).toBe('mailto:ada@lumen.test');
    expect(safeHref('  https://a.test  ')).toBe('https://a.test');
  });

  it('drops javascript, data and every other scheme', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox',
      'file:///etc/passwd',
      '/relative/path.md',
      '#anchor',
      '',
      '   ',
    ]) {
      expect(safeHref(href)).toBeNull();
    }
  });

  it('drops a scheme hidden behind a control character', () => {
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref('java\tscript:alert(1)')).toBeNull();
    expect(safeHref('\u0000https://a.test')).toBeNull();
  });

  it('renders an unsafe link as its label, with no href at all', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ type: 'text', value: 'click' }]);
    expect(parseInline('[img](data:text/html,<script>)')).toEqual([{ type: 'text', value: 'img' }]);
  });
});

describe('reading the tree back out', () => {
  it('joins inline text and can leave code spans out', () => {
    const nodes = parseInline('a **b** `c` [d](https://e.test)');
    expect(inlineText(nodes)).toBe('a b c d');
    expect(inlineText(nodes, false)).toBe('a b  d');
  });

  it('flattens blocks to prose, keeping code verbatim', () => {
    const lines = blocksToText(parseMarkdown('# T\n\n- [ ] one\n- two\n\n> quoted\n'));
    expect(lines.filter((l) => l !== '')).toEqual(['T', '- [ ] one', '- two', '  quoted']);
  });

  it('renders a whole document down to plain text', () => {
    expect(toPlainText('# Title\n\nSome *text*.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n')).toBe(
      'Title\n\nSome text.\n\na\tb\n1\t2\n',
    );
  });
});

describe('tags', () => {
  it('finds tags in prose, lists, quotes, tables and link labels', () => {
    expect(collectTagTokens('#one and #two\n\n- #three\n\n> #four\n')).toEqual([
      'one',
      'two',
      'three',
      'four',
    ]);
    expect(collectTagTokens('| #cell |\n| --- |\n| #row |\n')).toEqual(['cell', 'row']);
    expect(collectTagTokens('[#label](https://a.test)')).toEqual(['label']);
  });

  it('ignores hashes inside code spans and fences', () => {
    expect(collectTagTokens('`#nope` in a span\n\n```\n#alsonope\n```\n')).toEqual([]);
    expect(collectTagTokens('```\n# heading-like\n#tagish\n```\n')).toEqual([]);
  });

  it('ignores heading markers and hashes glued to a word', () => {
    expect(collectTagTokens('# Heading\n\nissue#42 and c#\n')).toEqual([]);
  });

  it('keeps slashes and dashes inside a tag but stops at punctuation', () => {
    expect(collectTagTokens('#work/2026-q1, #done.')).toEqual(['work/2026-q1', 'done']);
  });
});

// ── rendering ─────────────────────────────────────────────────────────────

function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child as ReactNode, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  out.push(node);
  const props = node.props as { children?: ReactNode };
  if (props.children !== undefined) elements(props.children, out);
  return out;
}

describe('rendering', () => {
  it('returns React elements, never a markup string', () => {
    const tree = renderMarkdown('# T\n\n<script>alert(1)</script>\n\n[a](https://a.test)\n');
    for (const el of elements(tree)) {
      expect(el.props).not.toHaveProperty('dangerouslySetInnerHTML');
      expect(typeof el.type === 'string' || typeof el.type === 'function').toBe(true);
    }
  });

  it('builds the element each block calls for', () => {
    const tree = renderMarkdown('## Head\n\ntext\n\n```\ncode\n```\n\n- one\n\n---\n');
    expect(elements(tree).map((el) => el.type)).toEqual([
      'h2',
      'p',
      'pre',
      'code',
      'ul',
      'li',
      'hr',
    ]);
  });

  it('caps a heading at h6', () => {
    expect(elements(renderMarkdown('####### deep')).map((el) => el.type)).toEqual(['p']);
    expect(elements(renderMarkdown('###### six')).map((el) => el.type)).toEqual(['h6']);
  });

  it('opens links in a new tab without handing over the opener', () => {
    const link = elements(renderMarkdown('[a](https://a.test)')).find((el) => el.type === 'a');
    expect(link?.props).toMatchObject({
      href: 'https://a.test',
      target: '_blank',
      rel: 'noreferrer noopener',
    });
  });

  it('shows raw HTML as text instead of running it', () => {
    render(createElement('div', null, renderMarkdown('<script>alert(1)</script> and <b>b</b>')));
    expect(screen.getByText('<script>alert(1)</script> and <b>b</b>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('gives a task item a checkbox that reports its own source line', () => {
    const onToggleTask = vi.fn();
    render(
      createElement(
        'div',
        null,
        renderMarkdown('intro\n\n- [ ] one\n- [x] two\n', { lineOffset: 3, onToggleTask }),
      ),
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    expect(boxes[0]).toHaveAccessibleName('one');
    boxes[1]?.click();
    expect(onToggleTask).toHaveBeenCalledWith(6);
  });

  it('disables the checkbox when nothing can be written back', () => {
    render(createElement('div', null, renderMarkdown('- [ ] one\n')));
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('numbers an ordered list from its first marker', () => {
    const ol = elements(renderMarkdown('3. three\n4. four\n')).find((el) => el.type === 'ol');
    expect(ol?.props).toMatchObject({ start: 3 });
    const plain = elements(renderMarkdown('1. one\n')).find((el) => el.type === 'ol');
    expect(plain?.props).toEqual({ start: undefined, children: expect.anything() });
  });

  it('renders a table with its alignment', () => {
    render(createElement('div', null, renderMarkdown('| a |\n| ---: |\n| 1 |\n')));
    expect(screen.getByRole('columnheader')).toHaveStyle({ textAlign: 'right' });
    expect(screen.getByRole('cell')).toHaveTextContent('1');
  });
});

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  type MarkdownBlock,
  type MarkdownInline,
  parseInline,
  parseMarkdown,
  renderMarkdown,
  safeHref,
} from './markdown';

function text(nodes: readonly MarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        default:
          return text(node.children);
      }
    })
    .join('');
}

function first(source: string): MarkdownBlock | undefined {
  return parseMarkdown(source)[0];
}

describe('headings', () => {
  it('reads the level and the content', () => {
    const block = first('### Release notes');
    expect(block).toMatchObject({ type: 'heading', level: 3 });
    expect(block?.type === 'heading' && text(block.children)).toBe('Release notes');
  });

  it('drops closing hashes and stops at six levels', () => {
    expect(first('## Title ##')).toMatchObject({ type: 'heading', level: 2 });
    expect(first('####### Seven')).toMatchObject({ type: 'paragraph' });
  });
});

describe('paragraphs', () => {
  it('joins wrapped lines into one block', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type === 'paragraph' && text(blocks[0].children)).toBe('one\ntwo');
  });

  it('is interrupted by a heading', () => {
    const blocks = parseMarkdown('lead in\n# Heading');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'heading']);
  });
});

describe('inline', () => {
  it('reads bold, italic and code spans', () => {
    expect(parseInline('**bold**')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
    ]);
    expect(parseInline('*soft*')).toEqual([
      { type: 'emphasis', children: [{ type: 'text', value: 'soft' }] },
    ]);
    expect(parseInline('`a + b`')).toEqual([{ type: 'code', value: 'a + b' }]);
  });

  it('nests bold inside italic for a triple run', () => {
    expect(parseInline('***both***')).toEqual([
      {
        type: 'strong',
        children: [{ type: 'emphasis', children: [{ type: 'text', value: 'both' }] }],
      },
    ]);
  });

  it('leaves snake_case words alone', () => {
    expect(parseInline('read_text_file')).toEqual([{ type: 'text', value: 'read_text_file' }]);
  });

  it('keeps markup inside a code span literal', () => {
    expect(parseInline('`**not bold**`')).toEqual([{ type: 'code', value: '**not bold**' }]);
  });

  it('honours backslash escapes', () => {
    expect(parseInline('\\*literal\\*')).toEqual([{ type: 'text', value: '*literal*' }]);
  });

  it('treats an unclosed marker as text', () => {
    expect(text(parseInline('2 * 3 * 4'))).toBe('2 * 3 * 4');
  });
});

describe('links', () => {
  it('accepts http, https and mailto', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('rejects every other scheme', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html;base64,AAA')).toBeNull();
    expect(safeHref('/local/path')).toBeNull();
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref('')).toBeNull();
  });

  it('keeps the label but drops an unsafe target', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ type: 'text', value: 'click' }]);
  });

  it('parses a safe link with a title', () => {
    expect(parseInline('[home](https://example.com "Home")')).toEqual([
      { type: 'link', href: 'https://example.com', children: [{ type: 'text', value: 'home' }] },
    ]);
  });

  it('ignores images', () => {
    expect(parseInline('before ![alt](https://example.com/a.png) after')).toEqual([
      { type: 'text', value: 'before  after' },
    ]);
  });
});

describe('code blocks', () => {
  it('keeps the body verbatim and records the language', () => {
    const block = first('```ts\nconst a = 1;\n  indented\n```');
    expect(block).toEqual({ type: 'code', language: 'ts', value: 'const a = 1;\n  indented' });
  });

  it('closes an unterminated fence at the end of the file', () => {
    expect(first('```\nstill code')).toEqual({ type: 'code', language: null, value: 'still code' });
  });
});

describe('lists', () => {
  it('reads an unordered list', () => {
    const block = first('- one\n- two');
    expect(block?.type).toBe('list');
    if (block?.type !== 'list') return;
    expect(block.ordered).toBe(false);
    expect(block.items).toHaveLength(2);
    expect(block.items[0]?.[0]?.type === 'paragraph' && text(block.items[0][0].children)).toBe(
      'one',
    );
  });

  it('reads an ordered list and its start number', () => {
    const block = first('3. three\n4. four');
    expect(block).toMatchObject({ type: 'list', ordered: true, start: 3 });
  });

  it('nests an indented list inside its item', () => {
    const block = first('- outer\n  - inner');
    if (block?.type !== 'list') throw new Error('expected a list');
    const item = block.items[0] ?? [];
    expect(item.map((b) => b.type)).toEqual(['paragraph', 'list']);
  });

  it('ends at a blank line followed by a paragraph', () => {
    const blocks = parseMarkdown('- one\n\nafter');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'paragraph']);
  });
});

describe('quotes and rules', () => {
  it('parses nested blocks inside a quote', () => {
    const block = first('> # Quoted\n> body');
    if (block?.type !== 'quote') throw new Error('expected a quote');
    expect(block.children.map((b) => b.type)).toEqual(['heading', 'paragraph']);
  });

  it('reads the three rule spellings', () => {
    expect(first('---')).toEqual({ type: 'rule' });
    expect(first('***')).toEqual({ type: 'rule' });
    expect(first('_ _ _')).toEqual({ type: 'rule' });
  });
});

describe('tables', () => {
  const source = '| Name | Size |\n| :--- | ---: |\n| a.txt | 12 |\n| b.txt | 40 |';

  it('reads the header, alignment and rows', () => {
    const block = first(source);
    if (block?.type !== 'table') throw new Error('expected a table');
    expect(block.header.map(text)).toEqual(['Name', 'Size']);
    expect(block.align).toEqual(['left', 'right']);
    expect(block.rows.map((row) => row.map(text))).toEqual([
      ['a.txt', '12'],
      ['b.txt', '40'],
    ]);
  });

  it('does not read a rule under a paragraph as a table', () => {
    expect(parseMarkdown('text\n---').map((b) => b.type)).toEqual(['paragraph', 'rule']);
  });

  it('pads a short row to the header width', () => {
    const block = first('| a | b |\n| --- | --- |\n| only |');
    if (block?.type !== 'table') throw new Error('expected a table');
    expect(block.rows[0]).toHaveLength(2);
  });
});

describe('renderMarkdown', () => {
  it('produces elements, not markup', () => {
    render(createElement('div', null, renderMarkdown('# Title\n\nSome **bold** text.')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('renders a safe link and flattens an unsafe one', () => {
    const { container } = render(
      createElement(
        'div',
        null,
        renderMarkdown('[safe](https://example.com) [unsafe](javascript:alert(1))'),
      ),
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com');
    expect(container.textContent).toContain('unsafe');
  });

  it('shows raw HTML as text', () => {
    const { container } = render(
      createElement('div', null, renderMarkdown('<img src=x onerror="alert(1)">')),
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('renders a table with alignment', () => {
    const { container } = render(
      createElement('div', null, renderMarkdown('| a |\n| ---: |\n| 1 |')),
    );
    expect(container.querySelector('th')?.style.textAlign).toBe('right');
    expect(container.querySelectorAll('td')).toHaveLength(1);
  });
});

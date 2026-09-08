import { afterEach, describe, expect, it } from 'vitest';
import {
  ALIGN_COMMANDS,
  alignmentOf,
  anchorHtml,
  blockTypeOf,
  closestLink,
  formatBlockValue,
  INITIAL_EDITOR_STATE,
  isInside,
  isInsideList,
  readEditorState,
  unwrapElement,
} from './editing';

function page(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function firstText(root: HTMLElement, selector: string): Node {
  const element = root.querySelector(selector);
  if (element === null) throw new Error(`no ${selector}`);
  const text = element.firstChild;
  if (text === null) throw new Error(`${selector} is empty`);
  return text;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('blockTypeOf', () => {
  it('finds the heading a node sits in', () => {
    const root = page('<h2>Title</h2>');
    expect(blockTypeOf(firstText(root, 'h2'), root)).toBe('h2');
  });

  it('reports a list item as a paragraph', () => {
    const root = page('<ul><li>one</li></ul>');
    expect(blockTypeOf(firstText(root, 'li'), root)).toBe('p');
  });

  it('finds a quote and a code block', () => {
    const root = page('<blockquote>quoted</blockquote><pre>code</pre>');
    expect(blockTypeOf(firstText(root, 'blockquote'), root)).toBe('blockquote');
    expect(blockTypeOf(firstText(root, 'pre'), root)).toBe('pre');
  });

  it('falls back to a paragraph outside any block', () => {
    const root = page('text');
    expect(blockTypeOf(root.firstChild, root)).toBe('p');
    expect(blockTypeOf(null, root)).toBe('p');
  });
});

describe('alignmentOf', () => {
  it('reads the alignment written on the block', () => {
    const root = page('<p style="text-align: center">centred</p>');
    expect(alignmentOf(firstText(root, 'p'), root)).toBe('center');
  });

  it('defaults to left', () => {
    const root = page('<p>plain</p>');
    expect(alignmentOf(firstText(root, 'p'), root)).toBe('left');
  });

  it('maps every alignment to its command', () => {
    expect(ALIGN_COMMANDS).toEqual({
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
    });
  });
});

describe('selection helpers', () => {
  it('finds the link around a node', () => {
    const root = page('<p>a <a href="https://a.test">link</a></p>');
    expect(closestLink(firstText(root, 'a'), root)?.getAttribute('href')).toBe('https://a.test');
    expect(closestLink(firstText(root, 'p'), root)).toBeNull();
  });

  it('knows whether a node is inside a list', () => {
    const root = page('<ul><li>one</li></ul><p>two</p>');
    expect(isInsideList(firstText(root, 'li'), root)).toBe(true);
    expect(isInsideList(firstText(root, 'p'), root)).toBe(false);
  });

  it('knows whether a node is inside the page', () => {
    const root = page('<p>a</p>');
    expect(isInside(root, firstText(root, 'p'))).toBe(true);
    expect(isInside(root, document.body)).toBe(false);
    expect(isInside(root, null)).toBe(false);
  });
});

describe('unwrapElement', () => {
  it('keeps the children where the element stood', () => {
    const root = page('<p>a <a href="https://a.test">link</a> b</p>');
    const anchor = root.querySelector('a');
    if (anchor === null) throw new Error('no anchor');
    unwrapElement(anchor);
    expect(root.innerHTML).toBe('<p>a link b</p>');
  });
});

describe('command values', () => {
  it('wraps a block tag for formatBlock', () => {
    expect(formatBlockValue('h1')).toBe('<h1>');
    expect(formatBlockValue('blockquote')).toBe('<blockquote>');
  });

  it('escapes the href and the label of an inserted link', () => {
    expect(anchorHtml('https://a.test?x=1&y=2', 'a "quote" & <b>')).toBe(
      '<a href="https://a.test?x=1&amp;y=2">a "quote" &amp; &lt;b&gt;</a>',
    );
  });
});

describe('readEditorState', () => {
  it('reports the default state when nothing is selected', () => {
    const root = page('<p>a</p>');
    expect(readEditorState(root)).toEqual(INITIAL_EDITOR_STATE);
  });
});

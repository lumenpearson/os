import { describe, expect, it } from 'vitest';
import {
  alignFromStyle,
  EMPTY_DOCUMENT,
  isSafeHref,
  normalizeLinkInput,
  sanitizeDocument,
  sanitizeHtml,
} from './sanitize';

describe('sanitizeDocument', () => {
  it('drops scripts with their contents', () => {
    expect(sanitizeDocument('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>');
  });

  it('drops media and frames', () => {
    expect(sanitizeDocument('<p>a</p><img src="x.png"><iframe src="x"></iframe>')).toBe('<p>a</p>');
  });

  it('removes event handlers and classes', () => {
    expect(sanitizeHtml('<p onclick="steal()" class="x" id="y">Hi</p>')).toBe('<p>Hi</p>');
  });

  it('turns a div into a paragraph', () => {
    expect(sanitizeDocument('<div>Hi</div>')).toBe('<p>Hi</p>');
  });

  it('unwraps a container that holds blocks', () => {
    expect(sanitizeDocument('<div><h1>Title</h1><div>Body</div></div>')).toBe(
      '<h1>Title</h1><p>Body</p>',
    );
  });

  it('keeps the inline tags the editor produces', () => {
    const html = '<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s> <code>e</code></p>';
    expect(sanitizeDocument(html)).toBe(html);
  });

  it('keeps lists, quotes and rules', () => {
    const html = '<ul><li>one</li><li>two</li></ul><blockquote><p>q</p></blockquote><hr>';
    expect(sanitizeDocument(html)).toBe(html);
  });

  it('maps near-equivalents onto allowed tags', () => {
    expect(sanitizeDocument('<h4>Deep</h4><p><strike>gone</strike></p>')).toBe(
      '<h3>Deep</h3><p><s>gone</s></p>',
    );
  });

  it('unwraps unknown elements but keeps their text', () => {
    expect(sanitizeHtml('<marquee>Hi <b>there</b></marquee>')).toBe('Hi <b>there</b>');
  });

  it('wraps loose text in a paragraph', () => {
    expect(sanitizeDocument('Hello <b>there</b>')).toBe('<p>Hello <b>there</b></p>');
  });

  it('returns an empty paragraph for an empty document', () => {
    expect(sanitizeDocument('   ')).toBe(EMPTY_DOCUMENT);
  });

  it('is idempotent', () => {
    const once = sanitizeDocument('<div>Text <a href="https://lumen.test">link</a></div>');
    expect(sanitizeDocument(once)).toBe(once);
  });

  it('ignores a head and its metadata when reading a full page', () => {
    const page =
      '<html><head><title>T</title><style>p{color:red}</style></head><body><p>Body</p></body></html>';
    expect(sanitizeDocument(page)).toBe('<p>Body</p>');
  });
});

describe('links', () => {
  it('keeps http, https and mailto', () => {
    expect(sanitizeHtml('<a href="https://a.test">a</a>')).toBe('<a href="https://a.test">a</a>');
    expect(sanitizeHtml('<a href="mailto:a@b.test">a</a>')).toBe('<a href="mailto:a@b.test">a</a>');
  });

  it('unwraps a script URL, keeping the text', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('click');
  });

  it('sees through padded protocols', () => {
    expect(isSafeHref('  java\tscript:alert(1)')).toBe(false);
    expect(isSafeHref('https://a.test')).toBe(true);
    expect(isSafeHref('/local/path')).toBe(false);
  });

  it('completes what the link dialog is given', () => {
    expect(normalizeLinkInput('lumen.test/docs')).toBe('https://lumen.test/docs');
    expect(normalizeLinkInput('someone@lumen.test')).toBe('mailto:someone@lumen.test');
    expect(normalizeLinkInput('https://lumen.test')).toBe('https://lumen.test');
    expect(normalizeLinkInput('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkInput('   ')).toBeNull();
  });
});

describe('alignment', () => {
  it('reads a whitelisted value from a style attribute', () => {
    expect(alignFromStyle('color: red; text-align: center')).toBe('center');
    expect(alignFromStyle('text-align: nowhere')).toBeNull();
    expect(alignFromStyle(null)).toBeNull();
  });

  it('keeps text-align on a block and nothing else', () => {
    expect(sanitizeHtml('<p style="color:red;text-align:center">x</p>')).toContain(
      'text-align: center',
    );
    expect(sanitizeHtml('<p style="color:red;text-align:center">x</p>')).not.toContain('color');
  });

  it('drops style from a span', () => {
    expect(sanitizeHtml('<span style="text-align:center">x</span>')).toBe('<span>x</span>');
  });
});

import { describe, expect, it } from 'vitest';
import {
  documentKind,
  documentTitle,
  exportHtmlDocument,
  htmlTitle,
  isEmptyDocument,
  LWR_VERSION,
  openDocument,
  parseWriterFile,
  rtfToText,
  serializeFor,
  serializeWriterFile,
  suggestedName,
  textToHtml,
} from './document';

const RTF = [
  '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fnil Helvetica;}}',
  '{\\colortbl;\\red255\\green255\\blue255;}',
  '{\\*\\generator Riched20 10.0;}',
  '\\f0\\fs28 Hello \\b world\\b0 .\\par',
  "Caf\\'e9 second line.\\par",
  '}',
].join('\n');

describe('documentKind', () => {
  it('reads the kind from the extension', () => {
    expect(documentKind('/a/b.lwr')).toBe('writer');
    expect(documentKind('/a/b.HTML')).toBe('html');
    expect(documentKind('/a/b.htm')).toBe('html');
    expect(documentKind('/a/b.rtf')).toBe('rtf');
    expect(documentKind('/a/b.md')).toBe('markdown');
    expect(documentKind('/a/b.txt')).toBe('text');
  });
});

describe('the .lwr container', () => {
  it('round-trips a document', () => {
    const raw = serializeWriterFile('<p>Hi</p>', 'Notes');
    expect(JSON.parse(raw)).toEqual({ version: LWR_VERSION, html: '<p>Hi</p>', title: 'Notes' });
    expect(parseWriterFile(raw)).toEqual({ html: '<p>Hi</p>', title: 'Notes' });
  });

  it('leaves out an empty title', () => {
    expect(JSON.parse(serializeWriterFile('<p>Hi</p>', null))).toEqual({
      version: LWR_VERSION,
      html: '<p>Hi</p>',
    });
  });

  it('sanitises the stored html on the way in', () => {
    const raw = JSON.stringify({ version: 1, html: '<p>Hi</p><script>alert(1)</script>' });
    expect(parseWriterFile(raw).html).toBe('<p>Hi</p>');
  });

  it('rejects a file that is not a Writer document', () => {
    expect(() => parseWriterFile('not json')).toThrow('not a Writer document');
    expect(() => parseWriterFile('{"version":1}')).toThrow('no content');
  });
});

describe('openDocument', () => {
  it('opens a Writer document for editing', () => {
    const raw = serializeWriterFile('<h1>Title</h1>', 'Title');
    expect(openDocument('/docs/a.lwr', raw)).toEqual({
      html: '<h1>Title</h1>',
      title: 'Title',
      readOnly: false,
    });
  });

  it('opens an HTML page as its sanitised body', () => {
    const page = '<html><head><title>Page</title></head><body><p>Body</p></body></html>';
    expect(openDocument('/docs/a.html', page)).toEqual({
      html: '<p>Body</p>',
      title: 'Page',
      readOnly: false,
    });
  });

  it('opens RTF as read-only text', () => {
    const opened = openDocument('/docs/a.rtf', RTF);
    expect(opened.readOnly).toBe(true);
    expect(opened.html).toContain('<p>Hello world.</p>');
  });

  it('opens anything else as plain text', () => {
    expect(openDocument('/docs/a.txt', 'one\ntwo')).toEqual({
      html: '<p>one</p><p>two</p>',
      title: null,
      readOnly: false,
    });
  });
});

describe('rtfToText', () => {
  it('keeps the text and drops the control words', () => {
    expect(rtfToText(RTF)).toBe(`Hello world.\nCaf${String.fromCharCode(233)} second line.`);
  });

  it('skips font and colour tables', () => {
    expect(rtfToText(RTF)).not.toContain('Helvetica');
    expect(rtfToText(RTF)).not.toContain('Riched20');
  });

  it('reads unicode escapes', () => {
    expect(rtfToText('{\\rtf1 \\u8212?dash\\par}')).toBe(`${String.fromCharCode(8212)}dash`);
  });

  it('leaves text that is not RTF alone', () => {
    expect(rtfToText('plain text')).toBe('plain text');
  });
});

describe('serializeFor', () => {
  it('writes JSON for .lwr', () => {
    expect(serializeFor('/a/b.lwr', '<p>Hi</p>', 'b')).toContain('"html": "<p>Hi</p>"');
  });

  it('writes a standalone page for .html', () => {
    const html = serializeFor('/a/b.html', '<p>Hi</p>', 'b');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>b</title>');
    expect(html).toContain('<p>Hi</p>');
  });

  it('writes markdown for .md and text for .txt', () => {
    expect(serializeFor('/a/b.md', '<h1>Hi</h1>', 'b')).toBe('# Hi\n');
    expect(serializeFor('/a/b.txt', '<h1>Hi</h1>', 'b')).toBe('Hi\n');
  });
});

describe('exportHtmlDocument', () => {
  it('escapes the title', () => {
    expect(exportHtmlDocument('<p>a</p>', 'a & b')).toContain('<title>a &amp; b</title>');
  });
});

describe('helpers', () => {
  it('reads a page title', () => {
    expect(htmlTitle('<html><head><title> Notes </title></head></html>')).toBe('Notes');
    expect(htmlTitle('<p>none</p>')).toBeNull();
  });

  it('turns text into paragraphs', () => {
    expect(textToHtml('one\n\ntwo')).toBe('<p>one</p><p><br></p><p>two</p>');
    expect(textToHtml('a < b')).toBe('<p>a &lt; b</p>');
  });

  it('knows an empty document', () => {
    expect(isEmptyDocument('<p><br></p>')).toBe(true);
    expect(isEmptyDocument(`<p>${String.fromCharCode(160)}</p>`)).toBe(true);
    expect(isEmptyDocument('<p>a</p>')).toBe(false);
    expect(isEmptyDocument('<hr>')).toBe(false);
  });

  it('names untitled and saved documents', () => {
    expect(documentTitle(null)).toBe('Untitled');
    expect(documentTitle('/home/user/Documents/Notes.lwr')).toBe('Notes');
    expect(suggestedName('/home/user/Notes.lwr', '.md')).toBe('Notes.md');
    expect(suggestedName(null, '.lwr')).toBe('Untitled.lwr');
  });
});

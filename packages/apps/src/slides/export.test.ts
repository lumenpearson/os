import { describe, expect, it } from 'vitest';
import type { Deck } from './deck';
import { escapeHtml, exportDeckHtml, imageDataUrl, toBase64 } from './export';

function wrap(slides: Deck['slides'], theme?: Deck['theme']): Deck {
  return { version: 1, title: 'Deck & Co', theme, slides };
}

describe('escapeHtml', () => {
  it('escapes every character that could close a tag or an attribute', () => {
    expect(escapeHtml(`<script>a & "b" 'c'</script>`)).toBe(
      '&lt;script&gt;a &amp; &quot;b&quot; &#39;c&#39;&lt;/script&gt;',
    );
  });

  it('escapes ampersands once', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('toBase64', () => {
  it('encodes bytes the same as the platform, past the chunk boundary', () => {
    expect(toBase64(new TextEncoder().encode('Slides'))).toBe('U2xpZGVz');
    const long = new Uint8Array(0x8000 + 17).fill(7);
    expect(toBase64(long)).toBe(btoa(String.fromCharCode(...long)));
  });

  it('builds a data URL for a mime type', () => {
    expect(imageDataUrl('image/png', new Uint8Array([1, 2, 3]))).toBe('data:image/png;base64,AQID');
  });
});

describe('exportDeckHtml', () => {
  it('writes one section per slide inside a complete document', () => {
    const html = exportDeckHtml(
      wrap([
        { id: 's1', layout: 'title', title: 'Roadmap', subtitle: 'What ships next' },
        { id: 's2', layout: 'bullets', title: 'Later', bullets: ['Widgets', 'Extensions', ''] },
      ]),
    );
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html.match(/<section/g)).toHaveLength(2);
    expect(html).toContain('<h1>Roadmap</h1>');
    expect(html).toContain('<li>Widgets</li><li>Extensions</li>');
    expect(html).not.toContain('<li></li>');
  });

  it('escapes the deck title, slide text and image sources', () => {
    const html = exportDeckHtml(
      wrap([
        { id: 's1', layout: 'text', title: '5 > 3 & <b>bold</b>', text: 'a < b' },
        { id: 's2', layout: 'image', title: 'Shot', imagePath: '/pic.png' },
      ]),
      { '/pic.png': 'data:image/png;base64,AAA"onerror="alert(1)' },
    );
    expect(html).toContain('<title>Deck &amp; Co</title>');
    expect(html).toContain('<h2>5 &gt; 3 &amp; &lt;b&gt;bold&lt;/b&gt;</h2>');
    expect(html).toContain('<p>a &lt; b</p>');
    expect(html).toContain('AAA&quot;onerror=&quot;alert(1)');
    expect(html).not.toContain('<b>bold</b>');
  });

  it('never lets slide text close the inline script', () => {
    const html = exportDeckHtml(wrap([{ id: 's1', layout: 'text', text: '</script><img>' }]));
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('splits a text block on blank lines and keeps single breaks', () => {
    const html = exportDeckHtml(wrap([{ id: 's1', layout: 'text', text: 'one\ntwo\n\nthree' }]));
    expect(html).toContain('<p>one<br>two</p><p>three</p>');
  });

  it('exports two columns and leaves a blank slide empty', () => {
    const html = exportDeckHtml(
      wrap([
        { id: 's1', layout: 'two-column', title: 'Split', left: 'Left', right: 'Right' },
        { id: 's2', layout: 'blank' },
      ]),
    );
    expect(html).toContain('<div class="columns"><div><p>Left</p></div><div><p>Right</p></div>');
    expect(html).toContain('<section class="" style="background:#ffffff;color:#141517"></section>');
  });

  it('skips an image whose data was not supplied', () => {
    const html = exportDeckHtml(wrap([{ id: 's1', layout: 'image', imagePath: '/missing.png' }]));
    expect(html).not.toContain('<img');
  });

  it('paints the deck theme onto every section', () => {
    const html = exportDeckHtml(wrap([{ id: 's1', layout: 'blank' }], 'dark'));
    expect(html).toContain('background:#141517;color:#f4f4f5');
  });

  it('carries a keyboard handler for the documented keys', () => {
    const html = exportDeckHtml(wrap([{ id: 's1', layout: 'blank' }]));
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End']) {
      expect(html).toContain(`'${key}'`);
    }
  });
});

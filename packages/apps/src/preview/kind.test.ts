import { describe, expect, it } from 'vitest';
import { canPreview, isZoomable, looksTextual, refineKind, SNIFF_LIMIT, viewerKind } from './kind';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);

describe('viewerKind', () => {
  it('routes bitmaps to the image viewer', () => {
    expect(viewerKind('/home/ada/shot.png')).toBe('image');
    expect(viewerKind('/home/ada/shot.JPEG')).toBe('image');
    expect(viewerKind('/home/ada/loop.gif')).toBe('image');
    expect(viewerKind('/home/ada/icon.ico')).toBe('image');
  });

  it('gives SVG its own viewer even though the VFS calls it an image', () => {
    expect(viewerKind('/logo.svg')).toBe('svg');
    expect(viewerKind('/LOGO.SVG')).toBe('svg');
  });

  it('gives JSON a tree even though the VFS calls it data', () => {
    expect(viewerKind('/config.json')).toBe('json');
  });

  it('gives CSV and TSV a table even though the VFS calls them spreadsheets', () => {
    expect(viewerKind('/rows.csv')).toBe('csv');
    expect(viewerKind('/rows.tsv')).toBe('csv');
  });

  it('does not pretend to read binary spreadsheets or documents', () => {
    expect(viewerKind('/budget.xlsx')).toBe('unsupported');
    expect(viewerKind('/budget.lsd')).toBe('unsupported');
    expect(viewerKind('/letter.docx')).toBe('unsupported');
    expect(viewerKind('/deck.pptx')).toBe('unsupported');
    expect(viewerKind('/notes.lwr')).toBe('unsupported');
    expect(viewerKind('/archive.zip')).toBe('unsupported');
    expect(viewerKind('/face.woff2')).toBe('unsupported');
    expect(viewerKind('/Timer.app')).toBe('unsupported');
  });

  it('renders Markdown and reads other source as text', () => {
    expect(viewerKind('/README.md')).toBe('markdown');
    expect(viewerKind('/notes.markdown')).toBe('markdown');
    expect(viewerKind('/main.rs')).toBe('text');
    expect(viewerKind('/index.html')).toBe('text');
    expect(viewerKind('/deploy.sh')).toBe('text');
    expect(viewerKind('/data.yaml')).toBe('text');
  });

  it('routes media to their players', () => {
    expect(viewerKind('/song.flac')).toBe('audio');
    expect(viewerKind('/clip.mkv')).toBe('video');
    expect(viewerKind('/paper.pdf')).toBe('pdf');
  });

  it('falls back to the hex dump for unregistered and extensionless files', () => {
    expect(viewerKind('/blob.xyz')).toBe('hex');
    expect(viewerKind('/home/ada/LICENSE')).toBe('hex');
    expect(viewerKind('/home/ada/.gitignore')).toBe('hex');
  });

  it('reports what Preview can open', () => {
    expect(canPreview('/a.png')).toBe(true);
    expect(canPreview('/a.bin')).toBe(true);
    expect(canPreview('/a.zip')).toBe(false);
  });

  it('marks the viewers the zoom controls apply to', () => {
    expect(isZoomable('image')).toBe(true);
    expect(isZoomable('svg')).toBe(true);
    expect(isZoomable('pdf')).toBe(false);
    expect(isZoomable('text')).toBe(false);
  });
});

describe('looksTextual', () => {
  it('accepts plain text, tabs and newlines', () => {
    expect(looksTextual(ascii('hello\tworld\r\n'))).toBe(true);
  });

  it('accepts an empty file', () => {
    expect(looksTextual(new Uint8Array(0))).toBe(true);
  });

  it('rejects anything holding a NUL byte', () => {
    expect(looksTextual(bytes(0x68, 0x00, 0x69))).toBe(false);
  });

  it('rejects a run of control characters', () => {
    expect(looksTextual(bytes(0x01, 0x02, 0x03, 0x04, 0x05, 0x41, 0x42))).toBe(false);
  });

  it('tolerates a stray control character in a long text file', () => {
    const text = ascii('a'.repeat(200));
    text[100] = 0x07;
    expect(looksTextual(text)).toBe(true);
  });

  it('only samples the head of the file', () => {
    const big = ascii('a'.repeat(SNIFF_LIMIT + 64));
    big[SNIFF_LIMIT + 8] = 0x00;
    expect(looksTextual(big)).toBe(true);
  });
});

describe('refineKind', () => {
  it('promotes an unknown file that reads as text', () => {
    expect(refineKind('hex', ascii('# a makefile\n'))).toBe('text');
  });

  it('keeps the hex dump for real binary', () => {
    expect(refineKind('hex', bytes(0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01))).toBe('hex');
  });

  it('never overrides a decided viewer', () => {
    expect(refineKind('image', ascii('not really'))).toBe('image');
    expect(refineKind('unsupported', ascii('plain'))).toBe('unsupported');
  });
});

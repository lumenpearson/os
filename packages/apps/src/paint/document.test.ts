import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  type Anchor,
  anchorOffset,
  clampDimension,
  clampSize,
  documentName,
  documentTitle,
  formatSize,
  isPng,
  linkDimensions,
  MAX_DIMENSION,
  parseDimension,
  pixelBytes,
  pngPath,
  rotatedSize,
  sameSize,
  scaleByPercent,
} from './document';

describe('dimensions', () => {
  it('clamps to a drawable range', () => {
    expect(clampDimension(0)).toBe(1);
    expect(clampDimension(-20)).toBe(1);
    expect(clampDimension(99999)).toBe(MAX_DIMENSION);
    expect(clampDimension(640.4)).toBe(640);
    expect(clampDimension(Number.NaN)).toBe(1);
  });

  it('parses a field of digits and rejects everything else', () => {
    expect(parseDimension('640')).toBe(640);
    expect(parseDimension('  32 ')).toBe(32);
    expect(parseDimension('')).toBeNull();
    expect(parseDimension('0')).toBeNull();
    expect(parseDimension('-4')).toBeNull();
    expect(parseDimension('12.5')).toBeNull();
    expect(parseDimension('9999999')).toBeNull();
    expect(parseDimension('64px')).toBeNull();
  });

  it('compares and measures a size', () => {
    expect(sameSize({ width: 2, height: 3 }, { width: 2, height: 3 })).toBe(true);
    expect(sameSize({ width: 2, height: 3 }, { width: 3, height: 2 })).toBe(false);
    expect(pixelBytes({ width: 10, height: 10 })).toBe(400);
    expect(formatSize({ width: 1200, height: 900 })).toBe('1200 × 900');
    expect(clampSize({ width: 0, height: 20000 })).toEqual({ width: 1, height: MAX_DIMENSION });
  });
});

describe('anchorOffset', () => {
  const from = { width: 100, height: 100 };
  const bigger = { width: 140, height: 160 };

  it('pins the old image to each corner when the canvas grows', () => {
    expect(anchorOffset('top-left', from, bigger)).toEqual({ x: 0, y: 0 });
    expect(anchorOffset('top-right', from, bigger)).toEqual({ x: 40, y: 0 });
    expect(anchorOffset('bottom-left', from, bigger)).toEqual({ x: 0, y: 60 });
    expect(anchorOffset('bottom-right', from, bigger)).toEqual({ x: 40, y: 60 });
  });

  it('centres on the axis an edge anchor leaves free', () => {
    expect(anchorOffset('top', from, bigger)).toEqual({ x: 20, y: 0 });
    expect(anchorOffset('left', from, bigger)).toEqual({ x: 0, y: 30 });
    expect(anchorOffset('centre', from, bigger)).toEqual({ x: 20, y: 30 });
  });

  it('goes negative when the canvas shrinks, so the crop is where the anchor says', () => {
    const smaller = { width: 60, height: 60 };
    expect(anchorOffset('bottom-right', from, smaller)).toEqual({ x: -40, y: -40 });
    expect(anchorOffset('centre', from, smaller)).toEqual({ x: -20, y: -20 });
    expect(anchorOffset('top-left', from, smaller)).toEqual({ x: 0, y: 0 });
  });

  it('offers nine anchors, all of which are distinct', () => {
    expect(ANCHORS).toHaveLength(9);
    expect(new Set<Anchor>(ANCHORS).size).toBe(9);
  });
});

describe('linkDimensions', () => {
  const original = { width: 1000, height: 500 };

  it('follows the edited side', () => {
    expect(linkDimensions(original, { ...original, width: 400 }, 'width')).toEqual({
      width: 400,
      height: 200,
    });
    expect(linkDimensions(original, { ...original, height: 100 }, 'height')).toEqual({
      width: 200,
      height: 100,
    });
  });

  it('never lets rounding produce a zero side', () => {
    expect(linkDimensions({ width: 1000, height: 3 }, { width: 1, height: 3 }, 'width')).toEqual({
      width: 1,
      height: 1,
    });
  });

  it('survives a degenerate original', () => {
    expect(linkDimensions({ width: 0, height: 0 }, { width: 40, height: 20 }, 'width')).toEqual({
      width: 40,
      height: 20,
    });
  });
});

describe('scaleByPercent', () => {
  it('scales both sides', () => {
    expect(scaleByPercent({ width: 200, height: 100 }, 50)).toEqual({ width: 100, height: 50 });
    expect(scaleByPercent({ width: 200, height: 100 }, 200)).toEqual({ width: 400, height: 200 });
  });

  it('refuses to scale away to nothing', () => {
    expect(scaleByPercent({ width: 200, height: 100 }, 0)).toEqual({ width: 2, height: 1 });
    expect(scaleByPercent({ width: 200, height: 100 }, Number.NaN)).toEqual({
      width: 200,
      height: 100,
    });
  });
});

describe('rotatedSize', () => {
  it('swaps the axes on an odd number of quarter turns', () => {
    const size = { width: 40, height: 10 };
    expect(rotatedSize(size, 1)).toEqual({ width: 10, height: 40 });
    expect(rotatedSize(size, 2)).toEqual(size);
    expect(rotatedSize(size, -1)).toEqual({ width: 10, height: 40 });
    expect(rotatedSize(size, 4)).toEqual(size);
  });
});

describe('paths and names', () => {
  it('keeps a png path and swaps every other extension', () => {
    expect(pngPath('/home/ada/Pictures/cat.png')).toBe('/home/ada/Pictures/cat.png');
    expect(pngPath('/home/ada/Pictures/cat.PNG')).toBe('/home/ada/Pictures/cat.PNG');
    expect(pngPath('/home/ada/Pictures/cat.jpg')).toBe('/home/ada/Pictures/cat.png');
    expect(pngPath('/home/ada/Pictures/holiday.2019.webp')).toBe(
      '/home/ada/Pictures/holiday.2019.png',
    );
    expect(pngPath('/home/ada/Pictures/sketch')).toBe('/home/ada/Pictures/sketch.png');
  });

  it('knows a png when it sees one', () => {
    expect(isPng('/a/b.png')).toBe(true);
    expect(isPng('/a/b.PNG')).toBe(true);
    expect(isPng('/a/b.jpeg')).toBe(false);
  });

  it('names an unsaved document Untitled', () => {
    expect(documentName(null)).toBe('Untitled');
    expect(documentName('/home/ada/Pictures/cat.png')).toBe('cat.png');
  });

  it('says Edited in the title while there are unsaved changes', () => {
    expect(documentTitle('/home/ada/cat.png', false)).toBe('cat.png');
    expect(documentTitle('/home/ada/cat.png', true)).toBe('cat.png — Edited');
    expect(documentTitle(null, true)).toBe('Untitled — Edited');
  });
});

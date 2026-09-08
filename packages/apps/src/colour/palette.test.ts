import { describe, expect, it } from 'vitest';
import { rgba } from '../paint/colour';
import {
  addSwatch,
  type ColourData,
  clearSwatches,
  DEFAULT_DATA,
  moveSwatch,
  NAME_LIMIT,
  nextSwatchId,
  normalizeData,
  readHex,
  removeSwatch,
  renameSwatch,
  SWATCH_LIMIT,
  swatchLabel,
} from './palette';

const base = (): ColourData => ({ ...DEFAULT_DATA, swatches: [] });

function withSwatches(count: number): ColourData {
  let data = base();
  for (let i = 0; i < count; i += 1) data = addSwatch(data, rgba(i, i, i), `Swatch ${i}`);
  return data;
}

describe('reading the file back', () => {
  it('gives the defaults for anything that is not an object', () => {
    for (const raw of [null, undefined, 42, 'x', []]) {
      expect(normalizeData(raw)).toEqual({ ...DEFAULT_DATA, swatches: [] });
    }
  });

  it('keeps a well-formed file exactly', () => {
    const file = {
      colour: '#123456',
      compare: '#abcdef',
      panel: 'vision',
      swatches: [{ id: 'swatch-1', hex: '#ff0000', name: 'Brand red' }],
    };
    expect(normalizeData(file)).toEqual(file);
  });

  it('lower-cases hex and accepts the short and alpha forms', () => {
    const data = normalizeData({ colour: '#ABC', compare: '#00FF0080' });
    expect(data.colour).toBe('#aabbcc');
    expect(data.compare).toBe('#00ff0080');
  });

  it('drops the entries it cannot read rather than failing the whole palette', () => {
    const data = normalizeData({
      colour: 'not a colour',
      panel: 'nonsense',
      swatches: [
        { id: 'swatch-1', hex: '#ff0000', name: 'Kept' },
        { id: 'swatch-2', hex: 'zzz' },
        { hex: '#00ff00' },
        'nope',
        { id: 'swatch-1', hex: '#0000ff', name: 'Duplicate id' },
        { id: 'swatch-9', hex: '#0000ff', name: 42 },
      ],
    });
    expect(data.colour).toBe(DEFAULT_DATA.colour);
    expect(data.panel).toBe(DEFAULT_DATA.panel);
    expect(data.swatches).toEqual([
      { id: 'swatch-1', hex: '#ff0000', name: 'Kept' },
      { id: 'swatch-9', hex: '#0000ff', name: '' },
    ]);
  });

  it('a palette it cannot read at all is an empty palette', () => {
    expect(normalizeData({ swatches: 'corrupt' }).swatches).toEqual([]);
    expect(normalizeData({ swatches: [1, 2, 3] }).swatches).toEqual([]);
  });

  it('stops at the limit, however long the file is', () => {
    const swatches = Array.from({ length: SWATCH_LIMIT + 20 }, (_, i) => ({
      id: `swatch-${i + 1}`,
      hex: '#ffffff',
      name: '',
    }));
    expect(normalizeData({ swatches }).swatches).toHaveLength(SWATCH_LIMIT);
  });

  it('trims a name that was edited into the file by hand', () => {
    const long = 'x'.repeat(NAME_LIMIT + 10);
    const data = normalizeData({ swatches: [{ id: 'swatch-1', hex: '#fff', name: long }] });
    expect(data.swatches[0]?.name).toHaveLength(NAME_LIMIT);
  });
});

describe('readHex', () => {
  it('returns the canonical spelling, or null', () => {
    expect(readHex('#FFF')).toBe('#ffffff');
    expect(readHex('#ff000080')).toBe('#ff000080');
    expect(readHex('rgb(1,2,3)')).toBeNull();
    expect(readHex(7)).toBeNull();
  });
});

describe('ids', () => {
  it('never reuses one that is already taken', () => {
    expect(nextSwatchId([])).toBe('swatch-1');
    const data = withSwatches(3);
    expect(nextSwatchId(data.swatches)).toBe('swatch-4');
    const gapped = removeSwatch(data, 'swatch-2');
    expect(nextSwatchId(gapped.swatches)).toBe('swatch-4');
  });

  it('ignores ids that were written by hand in another shape', () => {
    expect(nextSwatchId([{ id: 'mine', hex: '#fff', name: '' }])).toBe('swatch-1');
  });
});

describe('editing the palette', () => {
  it('appends, so the newest swatch is at the bottom', () => {
    const data = addSwatch(addSwatch(base(), rgba(255, 0, 0)), rgba(0, 255, 0), 'Leaf');
    expect(data.swatches.map((s) => s.hex)).toEqual(['#ff0000', '#00ff00']);
    expect(data.swatches[1]?.name).toBe('Leaf');
  });

  it('drops the oldest swatch once the palette is full', () => {
    const full = withSwatches(SWATCH_LIMIT);
    const after = addSwatch(full, rgba(1, 2, 3), 'Newest');
    expect(after.swatches).toHaveLength(SWATCH_LIMIT);
    expect(after.swatches[0]?.name).toBe('Swatch 1');
    expect(after.swatches[SWATCH_LIMIT - 1]?.name).toBe('Newest');
  });

  it('removes by id and leaves the data alone when there is nothing to remove', () => {
    const data = withSwatches(2);
    expect(removeSwatch(data, 'swatch-1').swatches.map((s) => s.id)).toEqual(['swatch-2']);
    expect(removeSwatch(data, 'missing')).toBe(data);
  });

  it('renames, trimming the name and capping its length', () => {
    const data = renameSwatch(withSwatches(1), 'swatch-1', `  ${'y'.repeat(NAME_LIMIT + 5)}  `);
    expect(data.swatches[0]?.name).toBe('y'.repeat(NAME_LIMIT));
    expect(renameSwatch(data, 'swatch-1', '   ').swatches[0]?.name).toBe('');
  });

  it('moves a swatch and stops at either end rather than wrapping', () => {
    const data = withSwatches(3);
    expect(moveSwatch(data, 'swatch-3', -1).swatches.map((s) => s.id)).toEqual([
      'swatch-1',
      'swatch-3',
      'swatch-2',
    ]);
    expect(moveSwatch(data, 'swatch-1', -1)).toBe(data);
    expect(moveSwatch(data, 'swatch-3', 1)).toBe(data);
    expect(moveSwatch(data, 'missing', 1)).toBe(data);
  });

  it('keeps the same set of swatches however they are moved', () => {
    const data = withSwatches(5);
    let shuffled = data;
    for (const [id, delta] of [
      ['swatch-5', -2],
      ['swatch-1', 3],
      ['swatch-3', -1],
      ['swatch-2', 2],
    ] as const) {
      shuffled = moveSwatch(shuffled, id, delta);
    }
    expect([...shuffled.swatches].map((s) => s.id).sort()).toEqual(
      [...data.swatches].map((s) => s.id).sort(),
    );
  });

  it('clears everything, and is a no-op on an empty palette', () => {
    const empty = base();
    expect(clearSwatches(empty)).toBe(empty);
    expect(clearSwatches(withSwatches(3)).swatches).toEqual([]);
  });
});

describe('labels', () => {
  it('falls back to the hex when the swatch has no name', () => {
    expect(swatchLabel({ id: 'swatch-1', hex: '#ff0000', name: '' })).toBe('#ff0000');
    expect(swatchLabel({ id: 'swatch-1', hex: '#ff0000', name: '  ' })).toBe('#ff0000');
    expect(swatchLabel({ id: 'swatch-1', hex: '#ff0000', name: 'Brand' })).toBe('Brand');
  });
});

import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  blockById,
  blockOf,
  blockSize,
  DEFAULT_BLOCK,
  formatBlockRange,
  isBlockId,
  stepBlock,
} from './blocks';

describe('the block table', () => {
  it('lists blocks that are well formed', () => {
    for (const block of BLOCKS) {
      expect(block.start, block.name).toBeLessThanOrEqual(block.end);
      expect(block.start, block.name).toBeGreaterThanOrEqual(0);
      expect(block.end, block.name).toBeLessThanOrEqual(0x10ffff);
      expect(block.name.trim(), block.name).toBe(block.name);
      expect(block.id, block.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('aligns every range to the 16 code points a Unicode block is granted', () => {
    for (const block of BLOCKS) {
      expect(block.start % 16, block.name).toBe(0);
      expect((block.end + 1) % 16, block.name).toBe(0);
    }
  });

  it('is ordered and never overlaps', () => {
    for (let i = 1; i < BLOCKS.length; i += 1) {
      const previous = BLOCKS[i - 1];
      const block = BLOCKS[i];
      if (!previous || !block) throw new Error('missing block');
      expect(block.start, `${previous.name} then ${block.name}`).toBeGreaterThan(previous.end);
    }
  });

  it('gives every block its own id and its own name', () => {
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length);
    expect(new Set(BLOCKS.map((b) => b.name)).size).toBe(BLOCKS.length);
  });

  it('opens on a block that exists', () => {
    expect(blockById(DEFAULT_BLOCK)?.name).toBe('General Punctuation');
  });

  it('states the ranges everyone quotes', () => {
    expect(blockById('basic-latin')).toMatchObject({ start: 0x0000, end: 0x007f });
    expect(blockById('latin-1-supplement')).toMatchObject({ start: 0x0080, end: 0x00ff });
    expect(blockById('general-punctuation')).toMatchObject({ start: 0x2000, end: 0x206f });
    expect(blockById('box-drawing')).toMatchObject({ start: 0x2500, end: 0x257f });
    expect(blockById('cjk-unified-ideographs')).toMatchObject({ start: 0x4e00, end: 0x9fff });
  });
});

describe('blockSize', () => {
  it('counts the code points a block covers, both ends included', () => {
    expect(blockSize({ id: 'x', name: 'X', start: 0x2000, end: 0x206f })).toBe(112);
    expect(blockSize({ id: 'x', name: 'X', start: 0, end: 0 })).toBe(1);
  });
});

describe('blockOf', () => {
  it('finds the block a code point falls in', () => {
    expect(blockOf(0x2014)?.name).toBe('General Punctuation');
    expect(blockOf(0x0041)?.name).toBe('Basic Latin');
    expect(blockOf(0x1d400)?.name).toBe('Mathematical Alphanumeric Symbols');
  });

  it('finds every first and last code point of every listed block', () => {
    for (const block of BLOCKS) {
      expect(blockOf(block.start)?.id, block.name).toBe(block.id);
      expect(blockOf(block.end)?.id, block.name).toBe(block.id);
    }
  });

  it('says nothing rather than guessing for a code point outside the list', () => {
    // Hangul Jamo is real, and deliberately not in the table.
    expect(blockOf(0x1100)).toBeNull();
    expect(blockOf(0x10ffff)).toBeNull();
  });
});

describe('stepBlock', () => {
  it('moves along the list and stops at either end', () => {
    const first = BLOCKS[0];
    const last = BLOCKS[BLOCKS.length - 1];
    if (!first || !last) throw new Error('empty table');
    expect(stepBlock(first.id, -1)).toBe(first.id);
    expect(stepBlock(last.id, 1)).toBe(last.id);
    expect(stepBlock(first.id, 1)).toBe(BLOCKS[1]?.id);
  });

  it('falls back to the default when the id is not one of ours', () => {
    expect(stepBlock('not-a-block', 1)).toBe(DEFAULT_BLOCK);
  });
});

describe('isBlockId and formatBlockRange', () => {
  it('recognises only the listed ids', () => {
    expect(isBlockId('arrows')).toBe(true);
    expect(isBlockId('pinned')).toBe(false);
    expect(isBlockId(7)).toBe(false);
  });

  it('prints a range the way Unicode does', () => {
    expect(formatBlockRange({ id: 'x', name: 'X', start: 0x2000, end: 0x206f })).toBe(
      'U+2000–U+206F',
    );
  });
});

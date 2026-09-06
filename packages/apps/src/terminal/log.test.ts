import { describe, expect, it } from 'vitest';
import {
  abbreviateHome,
  appendChunk,
  applyChunks,
  type Block,
  blockLines,
  countLines,
  dropLines,
  promptFor,
  promptText,
  trimBlocks,
  windowTitle,
} from './log';

const block = (id: number, command: string | null, chunks: Block['chunks'] = []): Block => ({
  id,
  prompt: command === null ? null : { user: 'ada@lumen', path: '~' },
  command,
  chunks,
});

describe('countLines', () => {
  it('counts complete and partial lines', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('\n\n')).toBe(2);
  });
});

describe('appendChunk', () => {
  it('merges into the previous chunk of the same kind', () => {
    const b = appendChunk(appendChunk(block(1, 'ls'), { kind: 'out', text: 'a' }), {
      kind: 'out',
      text: 'b',
    });
    expect(b.chunks).toEqual([{ kind: 'out', text: 'ab' }]);
  });

  it('starts a new chunk when the kind changes', () => {
    const b = appendChunk(appendChunk(block(1, 'ls'), { kind: 'out', text: 'a' }), {
      kind: 'err',
      text: 'e',
    });
    expect(b.chunks).toHaveLength(2);
  });

  it('ignores empty text', () => {
    expect(appendChunk(block(1, 'ls'), { kind: 'out', text: '' }).chunks).toEqual([]);
  });
});

describe('applyChunks', () => {
  it('routes chunks to their block', () => {
    const blocks = applyChunks(
      [block(1, 'ls'), block(2, 'pwd')],
      [
        { id: 1, chunk: { kind: 'out', text: 'x\n' } },
        { id: 2, chunk: { kind: 'err', text: 'boom\n' } },
      ],
    );
    expect(blocks[0]?.chunks).toEqual([{ kind: 'out', text: 'x\n' }]);
    expect(blocks[1]?.chunks).toEqual([{ kind: 'err', text: 'boom\n' }]);
  });

  it('creates a promptless block when the target is gone', () => {
    const blocks = applyChunks([], [{ id: 9, chunk: { kind: 'out', text: 'late\n' } }]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: 9, command: null, prompt: null });
  });

  it('returns the same array when there is nothing pending', () => {
    const blocks = [block(1, 'ls')];
    expect(applyChunks(blocks, [])).toBe(blocks);
  });
});

describe('blockLines and dropLines', () => {
  it('counts the echoed command plus its output', () => {
    expect(blockLines(block(1, 'ls', [{ kind: 'out', text: 'a\nb\n' }]))).toBe(3);
    expect(blockLines(block(1, null, [{ kind: 'out', text: 'a\n' }]))).toBe(1);
  });

  it('drops leading lines', () => {
    expect(dropLines('a\nb\nc\n', 2)).toBe('c\n');
    expect(dropLines('a\n', 5)).toBe('');
  });
});

describe('trimBlocks', () => {
  it('keeps everything below the limit', () => {
    const blocks = [block(1, 'ls', [{ kind: 'out', text: 'a\n' }])];
    expect(trimBlocks(blocks, 100)).toBe(blocks);
  });

  it('drops the oldest blocks past the limit', () => {
    const blocks = [1, 2, 3, 4].map((i) => block(i, `cmd${i}`, [{ kind: 'out', text: 'x\n' }]));
    const trimmed = trimBlocks(blocks, 4);
    expect(trimmed).toHaveLength(2);
    expect(trimmed[0]?.id).toBe(3);
  });

  it('cuts lines from the head of a block that alone overflows', () => {
    const blocks = [block(1, 'seq 6', [{ kind: 'out', text: '1\n2\n3\n4\n5\n6\n' }])];
    const trimmed = trimBlocks(blocks, 3);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]?.command).toBeNull();
    expect(trimmed[0]?.chunks[0]?.text).toBe('4\n5\n6\n');
  });

  it('never exceeds the limit', () => {
    const blocks = Array.from({ length: 50 }, (_, i) =>
      block(i, `c${i}`, [{ kind: 'out', text: 'a\nb\n' }]),
    );
    const trimmed = trimBlocks(blocks, 20);
    const total = trimmed.reduce((n, b) => n + blockLines(b), 0);
    expect(total).toBeLessThanOrEqual(20);
  });
});

describe('prompt and title', () => {
  it('abbreviates the home directory', () => {
    expect(abbreviateHome('/Users/ada', '/Users/ada')).toBe('~');
    expect(abbreviateHome('/Users/ada/Documents', '/Users/ada')).toBe('~/Documents');
    expect(abbreviateHome('/etc', '/Users/ada')).toBe('/etc');
    expect(abbreviateHome('/Users/adamant', '/Users/ada')).toBe('/Users/adamant');
  });

  it('builds the prompt', () => {
    const p = promptFor('ada', 'lumen', '/Users/ada/Documents', '/Users/ada');
    expect(p).toEqual({ user: 'ada@lumen', path: '~/Documents' });
    expect(promptText(p)).toBe('ada@lumen:~/Documents$ ');
  });

  it('titles the window after the directory, or an override', () => {
    expect(windowTitle('/Users/ada', '/Users/ada')).toBe('~ — Terminal');
    expect(windowTitle('/etc', '/Users/ada')).toBe('/etc — Terminal');
    expect(windowTitle('/etc', '/Users/ada', 'Backup script')).toBe('Backup script');
    expect(windowTitle('/etc', '/Users/ada', '   ')).toBe('/etc — Terminal');
  });
});

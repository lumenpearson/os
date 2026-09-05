import { describe, expect, it } from 'vitest';
import { initialPosition, type Position } from './board';
import { INITIAL_FEN, parseFen } from './fen';
import { leadLabel, MATERIAL_VALUES, material, points } from './material';

function at(fen: string): Position {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw new Error(`${parsed.error} — ${fen}`);
  return parsed.position;
}

const start = at(INITIAL_FEN);

describe('material', () => {
  it('counts a full set as level, with nothing taken', () => {
    const { lost, balance } = material(start, initialPosition());
    expect(lost).toEqual({ w: [], b: [] });
    expect(balance).toBe(0);
    expect(points(start, 'w')).toBe(points(start, 'b'));
    // Eight pawns, two knights, two bishops, two rooks and a queen.
    expect(points(start, 'w')).toBe(8 + 6 + 6 + 10 + 9);
  });

  it('names the piece a capture took off, and who is ahead by how much', () => {
    // 1. e4 d5 2. exd5 — Black is a pawn down.
    const after = at('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
    const { lost, balance } = material(start, after);
    expect(lost.b).toEqual(['p']);
    expect(lost.w).toEqual([]);
    expect(balance).toBe(1);
  });

  it('sets the captured pieces down heaviest first', () => {
    // Black has lost the a8 rook and the a7 pawn; White has lost a knight.
    const after = at('1nbqkbnr/1ppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQk - 0 5');
    const { lost, balance } = material(start, after);
    expect(lost.b).toEqual(['r', 'p']);
    expect(lost.w).toEqual(['n']);
    expect(balance).toBe(5 + 1 - 3);
  });

  it('scores a promoted pawn as the piece it became', () => {
    const promoted = at('QQ6/8/8/8/8/8/8/K6k w - - 0 1');
    const { lost, balance } = material(start, promoted);
    // The second queen was never captured, so it counts as nothing lost.
    expect(lost.w).not.toContain('q');
    expect(balance).toBe(18);
    expect(points(promoted, 'b')).toBe(0);
  });

  it('counts from the position the game started in, not from a full set', () => {
    const setup = at('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    const { lost, balance } = material(setup, at('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
    expect(lost.w).toEqual(['r']);
    expect(lost.b).toEqual([]);
    expect(balance).toBe(0);
  });

  it('gives Black the negative half of the same balance', () => {
    const white = at('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1');
    expect(material(white, white).balance).toBe(MATERIAL_VALUES.q);
    const black = at('q3k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(material(black, black).balance).toBe(-MATERIAL_VALUES.q);
  });
});

describe('the lead beside a side', () => {
  it('marks only the side that is ahead', () => {
    expect(leadLabel(3, 'w')).toBe('+3');
    expect(leadLabel(3, 'b')).toBe('');
    expect(leadLabel(-2, 'b')).toBe('+2');
    expect(leadLabel(-2, 'w')).toBe('');
  });

  it('says nothing at all when the material is level', () => {
    expect(leadLabel(0, 'w')).toBe('');
    expect(leadLabel(0, 'b')).toBe('');
  });
});

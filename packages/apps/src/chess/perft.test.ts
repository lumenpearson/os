import { describe, expect, it } from 'vitest';
import { initialPosition } from './board';
import { parseFen } from './fen';
import { perft, perftDivide } from './perft';

function at(fen: string) {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(result.error);
  return result.position;
}

/**
 * Published counts. They are facts about the rules of chess: when one of them
 * fails, the generator is wrong and the number stays.
 */
const POSITIONS: Array<{ name: string; fen: string; counts: number[] }> = [
  {
    name: 'the opening position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    counts: [20, 400, 8902, 197281],
  },
  {
    name: 'Kiwipete, where every special rule is live at once',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  {
    name: 'the endgame position, which turns on en passant and pins',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238],
  },
  {
    name: 'the promotion position',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  {
    name: 'the position with a knight fork on the king',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379],
  },
  {
    name: 'a quiet middlegame with no special rule in sight',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079],
  },
];

describe('perft', () => {
  for (const { name, fen, counts } of POSITIONS) {
    describe(name, () => {
      counts.forEach((expected, index) => {
        const depth = index + 1;
        it(`counts ${expected} moves at depth ${depth}`, () => {
          expect(perft(at(fen), depth)).toBe(expected);
        });
      });
    });
  }

  it('counts one leaf at depth zero, whatever the position', () => {
    expect(perft(initialPosition(), 0)).toBe(1);
  });

  it('divides the first ply into twenty branches of twenty from the start', () => {
    const branches = perftDivide(initialPosition(), 2);
    expect(branches).toHaveLength(20);
    expect(branches.every((branch) => branch.nodes === 20)).toBe(true);
    expect(branches[0]?.move).toBe('a2a3');
    expect(branches.reduce((total, branch) => total + branch.nodes, 0)).toBe(400);
  });

  it('divides Kiwipete the way the published table does', () => {
    const branches = perftDivide(at(POSITIONS[1]?.fen as string), 2);
    const nodes = (move: string) => branches.find((branch) => branch.move === move)?.nodes;
    expect(nodes('e1g1')).toBe(43);
    expect(nodes('e1c1')).toBe(43);
    expect(nodes('e5d7')).toBe(45);
    expect(nodes('e5f7')).toBe(44);
    expect(nodes('a2a4')).toBe(44);
  });
});

import { describe, expect, it } from 'vitest';
import { initialPosition, squareFrom } from './board';
import { INITIAL_FEN, parseFen, toFen } from './fen';
import { applyMove, findMove, legalMoves, type Move, toUci } from './moves';
import { parseSan, playSan, toSan } from './san';

function at(fen: string) {
  const result = parseFen(fen);
  if (!result.ok) throw new Error(`${fen}: ${result.error}`);
  return result.position;
}

/** SAN for one from/to pair. */
function san(
  fen: string,
  from: string,
  to: string,
  promotion: 'q' | 'r' | 'b' | 'n' | null = null,
) {
  const position = at(fen);
  const move = findMove(position, squareFrom(from), squareFrom(to), promotion);
  if (!move) throw new Error(`${from}${to} is not legal in ${fen}`);
  return toSan(position, move);
}

describe('writing SAN', () => {
  it('names a pawn move by its square and a piece move by letter and square', () => {
    expect(san(INITIAL_FEN, 'e2', 'e4')).toBe('e4');
    expect(san(INITIAL_FEN, 'g1', 'f3')).toBe('Nf3');
  });

  it('writes a pawn capture from its file', () => {
    expect(san('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4', 'd5')).toBe(
      'exd5',
    );
  });

  it('writes castling as O-O and O-O-O', () => {
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1', 'g1')).toBe('O-O');
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1', 'c1')).toBe('O-O-O');
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8', 'c8')).toBe('O-O-O');
  });

  it('writes the promotion piece, capture or not', () => {
    expect(san('3r2k1/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7', 'e8', 'q')).toBe('e8=Q+');
    expect(san('3r2k1/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7', 'e8', 'n')).toBe('e8=N');
    expect(san('3r2k1/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7', 'd8', 'r')).toBe('exd8=R+');
  });

  it('marks check with + and mate with #', () => {
    expect(san('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', 'a1', 'a8')).toBe('Ra8+');
    expect(san('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1', 'a8')).toBe('Ra8#');
  });
});

describe('disambiguation', () => {
  it('says nothing when only one piece can go there', () => {
    expect(san('4k3/8/8/8/8/8/8/N3K2N w - - 0 1', 'a1', 'c2')).toBe('Nc2');
  });

  it('names the file when the two differ by file', () => {
    expect(san('4k3/8/8/8/8/2N1N3/8/4K3 w - - 0 1', 'c3', 'd5')).toBe('Ncd5');
    expect(san('4k3/8/8/8/8/2N1N3/8/4K3 w - - 0 1', 'e3', 'd5')).toBe('Ned5');
  });

  it('names the rank when the files are the same', () => {
    expect(san('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a1', 'a3')).toBe('R1a3');
    expect(san('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a5', 'a3')).toBe('R5a3');
  });

  /** Three queens reaching one square: two share the file, two share the rank. */
  it('names the whole square when neither file nor rank is enough', () => {
    const fen = '6k1/8/8/8/Q7/8/8/Q2Q3K w - - 0 1';
    expect(san(fen, 'a1', 'd4')).toBe('Qa1d4');
    expect(san(fen, 'a4', 'd4')).toBe('Q4d4');
    expect(san(fen, 'd1', 'd4')).toBe('Qdd4');
  });

  it('never disambiguates a king, which is alone by definition', () => {
    expect(san('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1', 'e2')).toBe('Ke2');
  });

  it('leaves out a rival that would be pinned, because it is not a legal move', () => {
    // The e-file knight cannot move at all, so the other one needs no letter.
    expect(san('4r2k/8/8/8/8/2N1N3/8/4K3 w - - 0 1', 'c3', 'd5')).toBe('Nd5');
  });
});

describe('reading SAN', () => {
  it('reads the forms it writes', () => {
    const position = at('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(toUci(parseSan(position, 'O-O') as Move)).toBe('e1g1');
    expect(toUci(parseSan(position, '0-0-0') as Move)).toBe('e1c1');
    expect(toUci(parseSan(position, 'Ke2') as Move)).toBe('e1e2');
    expect(toUci(parseSan(position, 'Rh1h5') as Move)).toBe('h1h5');
  });

  it('ignores the decorations a move list may carry', () => {
    const position = at('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    expect(toUci(parseSan(position, 'Ra8#') as Move)).toBe('a1a8');
    expect(toUci(parseSan(position, 'Ra8+!?') as Move)).toBe('a1a8');
    expect(toUci(parseSan(position, ' Ra8 ') as Move)).toBe('a1a8');
  });

  it('reads a promotion with or without the equals sign', () => {
    const position = at('3r2k1/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(toUci(parseSan(position, 'e8=Q') as Move)).toBe('e7e8q');
    expect(toUci(parseSan(position, 'e8N') as Move)).toBe('e7e8n');
    expect(toUci(parseSan(position, 'exd8=R+') as Move)).toBe('e7d8r');
  });

  it('reads an en passant capture, with or without the suffix', () => {
    const position = at('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
    expect(toUci(parseSan(position, 'exf6') as Move)).toBe('e5f6');
    expect(toUci(parseSan(position, 'exf6e.p.') as Move)).toBe('e5f6');
  });

  it('refuses a move that is ambiguous, illegal or not notation at all', () => {
    const position = at('4k3/8/8/8/8/2N1N3/8/4K3 w - - 0 1');
    expect(parseSan(position, 'Nd5')).toBeNull();
    expect(parseSan(position, 'Nd4')).toBeNull();
    expect(parseSan(position, '')).toBeNull();
    expect(parseSan(position, 'hello')).toBeNull();
    expect(parseSan(position, 'e9')).toBeNull();
    expect(parseSan(position, 'O-O')).toBeNull();
  });

  it('does not read a pawn push as a capture, or the reverse', () => {
    const position = at('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    expect(parseSan(position, 'd5')).toBeNull();
    expect(parseSan(position, 'exd5')).not.toBeNull();
    expect(parseSan(position, 'e5')).not.toBeNull();
  });
});

describe('a game driven by notation', () => {
  const OPERA_GAME = [
    'e4',
    'e5',
    'Nf3',
    'd6',
    'd4',
    'Bg4',
    'dxe5',
    'Bxf3',
    'Qxf3',
    'dxe5',
    'Bc4',
    'Nf6',
    'Qb3',
    'Qe7',
    'Nc3',
    'c6',
    'Bg5',
    'b5',
    'Nxb5',
    'cxb5',
    'Bxb5+',
    'Nbd7',
    'O-O-O',
    'Rd8',
    'Rxd7',
    'Rxd7',
    'Rd1',
    'Qe6',
    'Bxd7+',
    'Nxd7',
    'Qb8+',
    'Nxb8',
    'Rd8#',
  ];

  it('plays every move of it', () => {
    const played = playSan(initialPosition(), OPERA_GAME);
    expect(played.rejected).toBeNull();
    expect(played.played).toHaveLength(OPERA_GAME.length);
    expect(toFen(played.position)).toBe('1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17');
  });

  /**
   * Round-tripping the whole game is the real test of disambiguation: every
   * move has to come back out of the writer exactly as it went in.
   */
  it('writes every move back as the same notation', () => {
    let position = initialPosition();
    for (const text of OPERA_GAME) {
      const move = parseSan(position, text) as Move;
      expect(move, text).not.toBeNull();
      expect(toSan(position, move, legalMoves(position))).toBe(text);
      position = applyMove(position, move);
    }
  });

  it('stops at the first move that does not fit and says which', () => {
    const played = playSan(initialPosition(), ['e4', 'e5', 'Nf6', 'd6']);
    expect(played.rejected).toBe('Nf6');
    expect(played.played).toHaveLength(2);
  });

  it('ends the two-move mate with a hash', () => {
    let position = initialPosition();
    const moves = ['f3', 'e5', 'g4'];
    for (const text of moves) position = applyMove(position, parseSan(position, text) as Move);
    const mate = parseSan(position, 'Qh4') as Move;
    expect(toSan(position, mate)).toBe('Qh4#');
  });
});

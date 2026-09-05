/**
 * The board. Eight files by eight ranks of real buttons, so the whole game is
 * playable from the keyboard without a second code path: Tab reaches the
 * board, the arrows walk it, Enter picks a piece up and puts it down.
 *
 * Dragging is a convenience on top of that. It writes the dragged piece's
 * transform straight to the DOM inside requestAnimationFrame and tells React
 * once, when the pointer lifts.
 */

import { cx } from '@lumen/ui';
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import {
  BOARD_SIZE,
  type Color,
  FILE_NAMES,
  fileOf,
  isLightSquare,
  type Piece,
  type Position,
  pieceAt,
  rankOf,
  squareAt,
  squareName,
} from './board';
import type { Move } from './moves';
import { PieceGlyph, pieceName } from './PieceGlyph';

export interface ChessboardProps {
  position: Position;
  /** Black at the bottom. */
  flipped: boolean;
  /** The square whose piece is picked up, if any. */
  selected: number | null;
  /** Legal destinations from the selected square. */
  targets: readonly Move[];
  /** The move just played, highlighted so it is easy to see what changed. */
  lastMove: Move | null;
  /** The king in check, drawn as such. */
  checkedKing: number | null;
  /** Whether the person may pick anything up right now. */
  interactive: boolean;
  showCoordinates: boolean;
  showTargets: boolean;
  onSelect: (square: number | null) => void;
  onMove: (from: number, to: number) => void;
}

export function Chessboard({
  position,
  flipped,
  selected,
  targets,
  lastMove,
  checkedKing,
  interactive,
  showCoordinates,
  showTargets,
  onSelect,
  onMove,
}: ChessboardProps) {
  const host = useRef<HTMLDivElement>(null);
  const dragged = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(() => (flipped ? 8 : 48));
  const [dragging, setDragging] = useState<number | null>(null);

  /** Squares in the order they are drawn, which the flip reverses. */
  const order: number[] = [];
  for (let rank = BOARD_SIZE - 1; rank >= 0; rank -= 1) {
    for (let file = 0; file < BOARD_SIZE; file += 1) order.push(squareAt(file, rank));
  }
  const squares = flipped ? [...order].reverse() : order;

  const targetOf = (square: number) => targets.find((m) => m.to === square) ?? null;

  const commit = (square: number) => {
    if (!interactive) return;
    const occupant = pieceAt(position, square);
    if (selected !== null && targetOf(square)) {
      onMove(selected, square);
      return;
    }
    // Picking up your own piece always wins over putting one down, so
    // clicking from one of your pieces to another switches selection rather
    // than trying an illegal move.
    if (occupant && occupant.color === position.turn) {
      onSelect(selected === square ? null : square);
      return;
    }
    onSelect(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, square: number) => {
    const step = flipped ? -1 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault();
      const file = Math.min(BOARD_SIZE - 1, Math.max(0, fileOf(square) + delta[0]));
      const rank = Math.min(BOARD_SIZE - 1, Math.max(0, rankOf(square) + delta[1]));
      const next = squareAt(file, rank);
      setCursor(next);
      host.current?.querySelector<HTMLElement>(`[data-square="${next}"]`)?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit(square);
    }
    if (event.key === 'Escape' && selected !== null) {
      event.preventDefault();
      onSelect(null);
    }
  };

  /** Drag: the piece follows the pointer through a transform, not through state. */
  const startDrag = (event: ReactPointerEvent<HTMLElement>, square: number) => {
    const occupant = pieceAt(position, square);
    if (!interactive || event.button !== 0 || !occupant || occupant.color !== position.turn) return;
    const board = host.current;
    if (!board) return;
    event.preventDefault();
    onSelect(square);
    setDragging(square);
    const rect = board.getBoundingClientRect();
    const size = rect.width / BOARD_SIZE;
    let frame = 0;
    let latest = { x: 0, y: 0 };

    const paint = () => {
      frame = 0;
      const node = dragged.current;
      if (node) node.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      const index = squares.indexOf(square);
      const home = {
        x: rect.left + (index % BOARD_SIZE) * size + size / 2,
        y: rect.top + Math.floor(index / BOARD_SIZE) * size + size / 2,
      };
      latest = { x: e.clientX - home.x, y: e.clientY - home.y };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (frame) cancelAnimationFrame(frame);
      setDragging(null);
      const file = Math.floor((e.clientX - rect.left) / size);
      const row = Math.floor((e.clientY - rect.top) / size);
      if (file < 0 || file > 7 || row < 0 || row > 7) return;
      const dropped = squares[row * BOARD_SIZE + file];
      if (dropped !== undefined && dropped !== square && targetOf(dropped)) {
        onMove(square, dropped);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={host}
      role="grid"
      aria-label="Chessboard"
      className="grid aspect-square w-full max-w-[min(100%,72vh)] grid-cols-8 overflow-hidden rounded-sm border border-rule-strong"
    >
      {squares.map((square) => {
        const occupant: Piece | null = pieceAt(position, square);
        const target = targetOf(square);
        const isFrom = lastMove?.from === square;
        const isTo = lastMove?.to === square;
        return (
          <Square
            key={square}
            square={square}
            piece={occupant}
            light={isLightSquare(square)}
            selected={selected === square}
            target={showTargets ? target : null}
            recent={isFrom || isTo}
            checked={checkedKing === square}
            dragging={dragging === square}
            cursor={cursor === square}
            coordinates={showCoordinates}
            flipped={flipped}
            turn={position.turn}
            interactive={interactive}
            dragRef={dragging === square ? dragged : null}
            onKeyDown={(e) => onKeyDown(e, square)}
            onPointerDown={(e) => startDrag(e, square)}
            onClick={() => commit(square)}
            onFocus={() => setCursor(square)}
          />
        );
      })}
    </div>
  );
}

interface SquareProps {
  square: number;
  piece: Piece | null;
  light: boolean;
  selected: boolean;
  target: Move | null;
  recent: boolean;
  checked: boolean;
  dragging: boolean;
  cursor: boolean;
  coordinates: boolean;
  flipped: boolean;
  turn: Color;
  interactive: boolean;
  dragRef: React.RefObject<HTMLDivElement | null> | null;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onClick: () => void;
  onFocus: () => void;
}

function Square({
  square,
  piece,
  light,
  selected,
  target,
  recent,
  checked,
  dragging,
  cursor,
  coordinates,
  flipped,
  turn,
  interactive,
  dragRef,
  onKeyDown,
  onPointerDown,
  onClick,
  onFocus,
}: SquareProps) {
  const file = fileOf(square);
  const rank = rankOf(square);
  const showFile = coordinates && (flipped ? rank === 7 : rank === 0);
  const showRank = coordinates && (flipped ? file === 7 : file === 0);
  const name = squareName(square);
  const label = piece
    ? `${name}, ${pieceName(piece.color, piece.type)}${target ? ', can be taken' : ''}`
    : `${name}${target ? ', legal move' : ', empty'}`;

  return (
    <button
      type="button"
      role="gridcell"
      data-square={square}
      tabIndex={cursor ? 0 : -1}
      aria-label={label}
      aria-selected={selected}
      data-cursor={interactive && piece?.color === turn ? 'grab' : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onFocus={onFocus}
      className={cx(
        'relative flex items-center justify-center lumen-focus',
        light ? 'bg-surface-2' : 'bg-surface-3',
        recent && 'after:absolute after:inset-0 after:bg-accent/15',
        selected && 'after:absolute after:inset-0 after:bg-accent/25',
        checked && 'after:absolute after:inset-0 after:bg-danger/30',
      )}
    >
      {showFile && (
        <span className="mono absolute bottom-0.5 right-1 text-2xs text-ink-3">
          {FILE_NAMES[file]}
        </span>
      )}
      {showRank && (
        <span className="mono absolute left-1 top-0.5 text-2xs tabular-nums text-ink-3">
          {rank + 1}
        </span>
      )}
      {piece && (
        <div
          ref={dragRef}
          className={cx('relative z-1 size-[86%]', dragging && 'pointer-events-none z-10')}
        >
          <PieceGlyph color={piece.color} type={piece.type} />
        </div>
      )}
      {/* A legal-move dot and a capture ring are circles because that is the
          shape of the thing on every board ever printed, not decoration. */}
      {target && !piece && (
        // deslop-ignore-next-line 19
        <span aria-hidden className="absolute size-[22%] rounded-full bg-accent/45" />
      )}
      {target && piece && (
        // deslop-ignore-next-line 19
        <span aria-hidden className="absolute inset-[6%] rounded-full border-2 border-accent/60" />
      )}
    </button>
  );
}

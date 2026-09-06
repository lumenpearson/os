/**
 * The board. Eight files by eight ranks of real buttons, so the whole game is
 * playable from the keyboard without a second code path: Tab reaches the
 * board, the arrows walk it, Enter picks a piece up and puts it down.
 *
 * Dragging is a convenience on top of that. It writes the dragged piece's
 * transform straight to the DOM inside requestAnimationFrame and tells React
 * once, when the pointer lifts.
 *
 * Where a square is drawn — and which square a drop landed on — comes from
 * layout.ts, so the grid, the arrow keys and the pointer cannot disagree.
 */

import { cx } from '@lumen/ui';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
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
  squareName,
} from './board';
import {
  boardOrder,
  cellCentre,
  homeSquare,
  showsFile,
  showsRank,
  squareFromPoint,
  stepSquare,
} from './layout';
import type { Move } from './moves';
import { PieceGlyph, pieceName } from './PieceGlyph';

/**
 * The two squares, written per colour scheme.
 *
 * Both are steps of the neutral ramp — so much ink over the surface — but the
 * ramp's own steps run the other way in the dark theme, where more ink means a
 * lighter square. Naming the pair per scheme keeps the light squares light on a
 * board that is otherwise the same object in both. The Tailwind class on each
 * square is the fallback: a browser that cannot read `light-dark` drops the
 * declaration and gets a flatter board rather than no board at all.
 */
const ink = (light: number, dark: number): string =>
  `light-dark(color-mix(in oklab, var(--color-ink) ${light}%, var(--color-surface)),` +
  ` color-mix(in oklab, var(--color-ink) ${dark}%, var(--color-surface)))`;

const LIGHT_SQUARE: CSSProperties = { backgroundColor: ink(8, 34) };
const DARK_SQUARE: CSSProperties = { backgroundColor: ink(32, 15) };

/**
 * One wash over a square, never two. A square can be the last move and the
 * selected one and the one the king is checked on at once; stacking three
 * translucent layers would make a fourth colour nobody chose, so the strongest
 * thing true of the square is the one that shows.
 */
function wash(checked: boolean, selected: boolean, recent: boolean): string | false {
  if (checked) return 'after:absolute after:inset-0 after:bg-danger/30';
  if (selected) return 'after:absolute after:inset-0 after:bg-accent/35';
  if (recent) return 'after:absolute after:inset-0 after:bg-accent/20';
  return false;
}

export interface ChessboardProps {
  position: Position;
  /** Black at the bottom. */
  flipped: boolean;
  /** The square whose piece is picked up, if any. */
  selected: number | null;
  /** Legal destinations from the selected square. */
  targets: readonly Move[];
  /** The move just played, marked so it is easy to see what changed. */
  lastMove: Move | null;
  /** The king in check, drawn as such. */
  checkedKing: number | null;
  /** Whether the person may pick anything up right now. */
  interactive: boolean;
  showCoordinates: boolean;
  showTargets: boolean;
  showLastMove: boolean;
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
  showLastMove,
  onSelect,
  onMove,
}: ChessboardProps) {
  const host = useRef<HTMLDivElement>(null);
  const dragged = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(() => homeSquare(flipped));
  const [dragging, setDragging] = useState<number | null>(null);

  // Turning the board round moves the cursor with it, so Tab lands near the
  // pieces the person is playing rather than behind the opponent's.
  useEffect(() => setCursor(homeSquare(flipped)), [flipped]);

  const squares = boardOrder(flipped);

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
    const next = stepSquare(square, event.key, flipped);
    if (next !== square) {
      event.preventDefault();
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
    const centre = cellCentre(square, flipped, size);
    const home = { x: rect.left + centre.x, y: rect.top + centre.y };
    let frame = 0;
    let latest = { x: 0, y: 0 };

    const paint = () => {
      frame = 0;
      const node = dragged.current;
      if (node) node.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      latest = { x: e.clientX - home.x, y: e.clientY - home.y };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (frame) cancelAnimationFrame(frame);
      setDragging(null);
      const dropped = squareFromPoint(e.clientX - rect.left, e.clientY - rect.top, size, flipped);
      if (dropped >= 0 && dropped !== square && targetOf(dropped)) onMove(square, dropped);
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
      // The board is square and fits its pane in both axes. The width cap is
      // the pane's own height in container units, not 72vh: on a tall screen
      // a short chess window would otherwise be allowed a board taller than
      // the room it has. `cqh` reads the container marked `container-type:
      // size` just above; a viewport unit reads the screen, which is not what
      // decides how much room this board has.
      className="grid aspect-square w-full max-w-[min(100%,100cqh)] grid-cols-8 overflow-hidden rounded-sm border border-rule-strong"
    >
      {squares.map((square) => {
        const occupant: Piece | null = pieceAt(position, square);
        const recent = showLastMove && (lastMove?.from === square || lastMove?.to === square);
        return (
          <Square
            key={square}
            square={square}
            piece={occupant}
            light={isLightSquare(square)}
            selected={selected === square}
            target={showTargets ? targetOf(square) : null}
            recent={recent}
            checked={checkedKing === square}
            dragging={dragging === square}
            cursor={cursor === square}
            file={showCoordinates && showsFile(square, flipped)}
            rank={showCoordinates && showsRank(square, flipped)}
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
  /** Carries the file letter along the bottom edge. */
  file: boolean;
  /** Carries the rank number up the left edge. */
  rank: boolean;
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
  file,
  rank,
  turn,
  interactive,
  dragRef,
  onKeyDown,
  onPointerDown,
  onClick,
  onFocus,
}: SquareProps) {
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
      style={light ? LIGHT_SQUARE : DARK_SQUARE}
      className={cx(
        'relative flex items-center justify-center lumen-focus',
        light ? 'bg-surface-2' : 'bg-surface-3',
        wash(checked, selected, recent),
      )}
    >
      {file && (
        <span className="mono absolute bottom-0.5 right-1 text-2xs text-ink-2">
          {FILE_NAMES[fileOf(square)]}
        </span>
      )}
      {rank && (
        <span className="mono absolute left-1 top-0.5 text-2xs tabular-nums text-ink-2">
          {rankOf(square) + 1}
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

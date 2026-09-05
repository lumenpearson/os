/**
 * The board: sixteen wells laid out in rows, and a layer of tiles on top that
 * are positioned rather than reflowed, so a move is one transform per tile.
 *
 * The wells carry the accessible names, which is what a reader walks; the tile
 * layer is decoration over them and is hidden from the tree. The whole board
 * is one tab stop — there is nothing to do to a single cell — and the arrows,
 * WASD and a drag all arrive at the same `onSlide`.
 */

import { cx } from '@lumen/ui';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type Direction, indexAt, SIZE } from './board';
import type { GameState, Tile } from './game';
import { directionForKey, swipeDirection } from './input';
import { cellName } from './labels';
import { type Layout, offsetOf, tileBand, tileFontSize } from './layout';

/**
 * One neutral ramp, five steps, and the accent reserved for 2048 and above.
 * Value is carried by the number, the step and the weight — never by hue.
 */
const BAND_CLASS: Record<number, string> = {
  0: 'bg-surface-2 text-ink-2 border-rule-strong',
  1: 'bg-surface-3 text-ink border-rule-strong font-medium',
  2: 'bg-ink-2 text-ink-inverse border-transparent font-medium',
  3: 'bg-ink text-ink-inverse border-transparent font-semibold',
  4: 'bg-accent text-accent-ink border-transparent font-semibold',
};

interface TileViewProps {
  tile: Tile;
  layout: Layout;
  animate: boolean;
  /** True for the tile this move put down: it fades up instead of blinking in. */
  entering: boolean;
}

const TileView = memo(function TileView({ tile, layout, animate, entering }: TileViewProps) {
  // A tile that is arriving renders once at its starting size, then flips on
  // the next frame so the transition has two states to run between.
  const [settled, setSettled] = useState(!entering);
  useEffect(() => {
    if (settled) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [settled]);

  const { x, y } = offsetOf(tile.index, layout);
  return (
    <div
      className={cx(
        'mono absolute top-0 left-0 flex items-center justify-center border tabular-nums select-none',
        animate &&
          'transition-[transform,opacity] duration-(--duration-fast) ease-(--ease-standard)',
        BAND_CLASS[tileBand(tile.value)] ?? '',
      )}
      style={{
        width: layout.cell,
        height: layout.cell,
        borderRadius: layout.tileRadius,
        fontSize: tileFontSize(layout.cell, tile.value),
        transform: `translate3d(${x}px, ${y}px, 0) scale(${settled ? 1 : 0.7})`,
        opacity: settled ? 1 : 0,
      }}
    >
      {tile.value}
    </div>
  );
});

export interface Twenty48BoardProps {
  state: GameState;
  layout: Layout;
  /** View → Animations. Off means tiles jump straight to their new cell. */
  animate: boolean;
  onSlide: (direction: Direction) => void;
}

export function Twenty48Board({ state, layout, animate, onSlide }: Twenty48BoardProps) {
  const board = useRef<HTMLDivElement>(null);

  // The game is played with the keyboard, so the board takes focus when the
  // window opens rather than waiting for a Tab.
  useEffect(() => {
    board.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    onSlide(direction);
  };

  /**
   * A drag is measured once, when the pointer lifts. Nothing follows the
   * pointer, so there is nothing to write per event.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const host = event.currentTarget;
    const from = { x: event.clientX, y: event.clientY };
    host.setPointerCapture(event.pointerId);
    const up = (e: PointerEvent) => {
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      const direction = swipeDirection(e.clientX - from.x, e.clientY - from.y);
      if (direction) onSlide(direction);
    };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  };

  const rows = [];
  for (let y = 0; y < SIZE; y += 1) {
    const wells = [];
    for (let x = 0; x < SIZE; x += 1) {
      const index = indexAt(x, y);
      wells.push(
        // biome-ignore lint/a11y/useFocusableInteractive: a cell is not a control — the board is the one tab stop and the cell only carries its name
        <div
          key={index}
          role="gridcell"
          aria-label={cellName(state, index)}
          className="bg-surface"
          style={{ width: layout.cell, height: layout.cell, borderRadius: layout.tileRadius }}
        />,
      );
    }
    rows.push(
      // biome-ignore lint/a11y/useFocusableInteractive: the board is the tab stop; a row is not
      <div
        key={y}
        role="row"
        className="flex"
        style={{ gap: layout.gap, marginTop: y === 0 ? 0 : layout.gap }}
      >
        {wells}
      </div>,
    );
  }

  return (
    <div
      ref={board}
      role="grid"
      tabIndex={0}
      aria-label={`2048 board, ${SIZE} rows by ${SIZE} columns. Arrow keys or W A S D to slide.`}
      aria-rowcount={SIZE}
      aria-colcount={SIZE}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      data-cursor="grab"
      className="relative shrink-0 touch-none border border-rule-strong bg-canvas select-none lumen-focus"
      style={{
        width: layout.size,
        height: layout.size,
        padding: layout.gap,
        borderRadius: layout.radius,
      }}
    >
      {rows}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {[...state.spent, ...state.tiles].map((tile) => (
          <TileView
            key={tile.id}
            tile={tile}
            layout={layout}
            animate={animate}
            entering={animate && tile.id === state.spawned}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The table: eleven piles of overlapping cards.
 *
 * Every card that can be picked up is a real button, so the whole game is
 * playable from the keyboard through the same code path as the mouse: Tab
 * reaches each pile, the arrows walk the cards in it, Enter picks a card up
 * and puts it down. Clicking does exactly what Enter does.
 *
 * Dragging is a convenience on top of that. The run being carried is drawn
 * once and then follows the pointer through a transform written straight to
 * the DOM inside requestAnimationFrame; React hears about it when the pointer
 * lifts, and the drop lands on whichever pile rectangle holds the pointer.
 */

import { cx } from '@lumen/ui';
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react';
import { CardBack, CardFace, CardSlot } from './CardFace';
import type { Card } from './cards';
import {
  allSlots,
  parseSlotKey,
  type Slot,
  STOCK,
  sameSlot,
  slotKey,
  tableauAt,
  WASTE,
} from './deal';
import type { Game } from './game';
import { cardLabel, emptyLabel, pileSummary, stockLabel } from './labels';
import {
  columnLeft,
  fanStep,
  type Metrics,
  pileHeight,
  type Spot,
  spotsWidth,
  tableauSpots,
  wasteSpots,
} from './layout';
import { canMove, lift, type Move, targetsFor } from './rules';

/** The cards the player is holding: a slot and how many come off the top. */
export interface Selection {
  readonly slot: Slot;
  readonly count: number;
}

export interface SolitaireTableProps {
  game: Game;
  metrics: Metrics;
  /** The height a column has before the table starts to scroll. */
  columnHeight: number;
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onMove: (move: Move) => void;
  onDraw: () => void;
  onAuto: (from: Slot) => void;
}

/** The top row leaves column 2 empty, so the waste can fan into it. */
const FOUNDATION_COLUMN = 3;

interface Pile {
  slot: Slot;
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  spots: Spot[];
  /** The spots that are buttons, in tab order; the last one is the top card. */
  seats: Spot[];
}

/** Where every pile sits and what is drawn in it. */
function pilesOf(game: Game, m: Metrics, columnHeight: number): Pile[] {
  const { table } = game;
  const piles: Pile[] = [];
  const add = (slot: Slot, left: number, top: number, spots: Spot[], height: number) => {
    piles.push({
      slot,
      key: slotKey(slot),
      left,
      top,
      width: spotsWidth(spots, m),
      height,
      spots,
      // The stock is one button whatever is on it; everywhere else, a card is
      // a button when it can be picked up.
      seats: slot.kind === 'stock' ? spots : spots.filter((spot) => spot.count > 0),
    });
  };

  const stockTop = table.stock[table.stock.length - 1];
  const stockSpots: Spot[] = stockTop
    ? [{ card: stockTop, faceUp: false, x: 0, y: 0, count: 0 }]
    : [];
  add(STOCK, columnLeft(0, m), 0, stockSpots, m.cardHeight);
  add(WASTE, columnLeft(1, m), 0, wasteSpots(table.waste, game.draw, m), m.cardHeight);

  table.foundations.forEach((cards, index) => {
    const top = cards[cards.length - 1];
    add(
      { kind: 'foundation', index },
      columnLeft(FOUNDATION_COLUMN + index, m),
      0,
      top ? [{ card: top, faceUp: true, x: 0, y: 0, count: 1 }] : [],
      m.cardHeight,
    );
  });

  const room = Math.max(m.cardHeight, columnHeight - m.tableauTop);
  table.tableau.forEach((_, index) => {
    const pile = tableauAt(table, index);
    const step = fanStep(pile.down.length, pile.up.length, room, m);
    add(
      { kind: 'tableau', index },
      columnLeft(index, m),
      m.tableauTop,
      tableauSpots(pile, step, m),
      Math.max(room, pileHeight(pile.down.length, pile.up.length, step, m)),
    );
  });
  return piles;
}

export function SolitaireTable({
  game,
  metrics,
  columnHeight,
  selection,
  onSelect,
  onMove,
  onDraw,
  onAuto,
}: SolitaireTableProps) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  /** Set when a drag ends, so the click it produces does not undo the drop. */
  const afterDrag = useRef(false);
  /** Set when a click moved a card, so the double click does not move another. */
  const justMoved = useRef(false);
  const [cursor, setCursor] = useState({ key: 'tableau-0', index: 0 });
  const [drag, setDrag] = useState<{ selection: Selection; x: number; y: number } | null>(null);

  const piles = pilesOf(game, metrics, columnHeight);
  const targets = selection
    ? new Set(targetsFor(game.table, selection.slot, selection.count).map(slotKey))
    : new Set<string>();
  const tableHeight = Math.max(columnHeight, ...piles.map((pile) => pile.top + pile.height));

  const focus = (key: string, index: number) => {
    host.current
      ?.querySelector<HTMLElement>(`button[data-slot="${key}"][data-index="${index}"]`)
      ?.focus();
  };

  /** A card, or an empty pile, has been activated — by click or by Enter. */
  const activate = (slot: Slot, count: number) => {
    justMoved.current = false;
    if (slot.kind === 'stock') {
      onDraw();
      return;
    }
    if (selection && !sameSlot(selection.slot, slot)) {
      const move = { from: selection.slot, to: slot, count: selection.count };
      if (canMove(game.table, move)) {
        onMove(move);
        justMoved.current = true;
        return;
      }
    }
    if (count > 0) {
      const same =
        selection && sameSlot(selection.slot, slot) && selection.count === count ? null : null;
      onSelect(
        selection && sameSlot(selection.slot, slot) && selection.count === count
          ? same
          : { slot, count },
      );
      return;
    }
    onSelect(null);
  };

  const goTo = (key: string, index: number) => {
    setCursor({ key, index });
    focus(key, index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, pile: Pile, index: number) => {
    const last = Math.max(0, pile.seats.length - 1);
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        goTo(pile.key, Math.min(last, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1))));
        return;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        goTo(pile.key, event.key === 'Home' ? 0 : last);
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault();
        const order = allSlots().map(slotKey);
        const at = order.indexOf(pile.key);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const key = order[(at + step + order.length) % order.length] as string;
        const target = piles.find((p) => p.key === key);
        goTo(key, Math.max(0, (target?.seats.length ?? 1) - 1));
        return;
      }
      case 'Escape': {
        if (!selection) return;
        event.preventDefault();
        onSelect(null);
        return;
      }
      default:
    }
  };

  /** Drag: the run follows the pointer through a transform, not through state. */
  const startDrag = (event: ReactPointerEvent<HTMLElement>, slot: Slot, count: number) => {
    if (event.button !== 0 || count <= 0) return;
    const wrapper = host.current;
    if (!wrapper) return;
    const button = event.currentTarget;
    const card = button.getBoundingClientRect();
    const frame = wrapper.getBoundingClientRect();
    const grabX = event.clientX - card.left;
    const grabY = event.clientY - card.top;
    const from = { x: event.clientX, y: event.clientY };
    const rects = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-pile]')).flatMap((el) => {
      const target = parseSlotKey(el.dataset.pile ?? '');
      return target ? [{ slot: target, rect: el.getBoundingClientRect() }] : [];
    });

    event.preventDefault();
    button.focus({ preventScroll: true });
    onSelect({ slot, count });

    let started = false;
    let painting = 0;
    let at = from;
    const paint = () => {
      painting = 0;
      const node = layer.current;
      if (!node) return;
      node.style.transform = `translate3d(${at.x - frame.left - grabX}px, ${at.y - frame.top - grabY}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      at = { x: e.clientX, y: e.clientY };
      if (!started) {
        if (Math.abs(at.x - from.x) < 4 && Math.abs(at.y - from.y) < 4) return;
        started = true;
        setDrag({
          selection: { slot, count },
          x: at.x - frame.left - grabX,
          y: at.y - frame.top - grabY,
        });
        return;
      }
      if (!painting) painting = requestAnimationFrame(paint);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (painting) cancelAnimationFrame(painting);
      if (!started) return;
      setDrag(null);
      afterDrag.current = true;
      const hit = rects.find(
        (candidate) =>
          e.clientX >= candidate.rect.left &&
          e.clientX <= candidate.rect.right &&
          e.clientY >= candidate.rect.top &&
          e.clientY <= candidate.rect.bottom &&
          canMove(game.table, { from: slot, to: candidate.slot, count }),
      );
      if (hit) onMove({ from: slot, to: hit.slot, count });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const carried: readonly Card[] = drag
    ? (lift(game.table, drag.selection.slot, drag.selection.count) ?? [])
    : [];

  return (
    <div
      ref={host}
      className="relative mx-auto"
      style={{ width: metrics.width, height: tableHeight }}
    >
      {piles.map((pile) => {
        const held = selection && sameSlot(selection.slot, pile.slot) ? selection.count : 0;
        const dragging =
          drag && sameSlot(drag.selection.slot, pile.slot) ? drag.selection.count : 0;
        const seat = (spot: Spot) => pile.seats.indexOf(spot);
        const tabbedSeat =
          cursor.key === pile.key
            ? Math.min(cursor.index, Math.max(0, pile.seats.length - 1))
            : Math.max(0, pile.seats.length - 1);
        const landing = pile.spots[pile.spots.length - 1];
        return (
          <div
            key={pile.key}
            data-pile={pile.key}
            role="group"
            aria-label={pileSummary(game.table, pile.slot)}
            className="absolute"
            style={{ left: pile.left, top: pile.top, width: pile.width, height: pile.height }}
          >
            {pile.spots.length === 0 && (
              <button
                type="button"
                data-slot={pile.key}
                data-index={0}
                tabIndex={0}
                aria-label={pile.slot.kind === 'stock' ? stockLabel(game) : emptyLabel(pile.slot)}
                onFocus={() => setCursor({ key: pile.key, index: 0 })}
                onClick={() => activate(pile.slot, 0)}
                onKeyDown={(e) => onKeyDown(e, pile, 0)}
                className="absolute left-0 top-0 rounded-sm lumen-focus"
              >
                <CardSlot width={metrics.cardWidth} height={metrics.cardHeight} />
              </button>
            )}
            {pile.spots.map((spot) => {
              const index = seat(spot);
              const picked = held > 0 && spot.count > 0 && spot.count <= held;
              const ghost = dragging > 0 && spot.count > 0 && spot.count <= dragging;
              const body = spot.faceUp ? (
                <CardFace
                  card={spot.card}
                  width={metrics.cardWidth}
                  height={metrics.cardHeight}
                  ghost={ghost}
                />
              ) : (
                <CardBack width={metrics.cardWidth} height={metrics.cardHeight} />
              );
              if (index < 0) {
                return (
                  <div
                    key={spot.card.id}
                    className="absolute"
                    style={{ left: spot.x, top: spot.y }}
                  >
                    {body}
                  </div>
                );
              }
              return (
                <button
                  key={spot.card.id}
                  type="button"
                  data-slot={pile.key}
                  data-index={index}
                  data-cursor={spot.count > 0 ? 'grab' : undefined}
                  tabIndex={tabbedSeat === index ? 0 : -1}
                  aria-label={
                    pile.slot.kind === 'stock'
                      ? stockLabel(game)
                      : cardLabel(spot.card, spot.faceUp, pile.slot)
                  }
                  aria-pressed={spot.count > 0 ? picked : undefined}
                  onFocus={() => setCursor({ key: pile.key, index })}
                  onPointerDown={(e) => startDrag(e, pile.slot, spot.count)}
                  onClick={() => {
                    if (afterDrag.current) {
                      afterDrag.current = false;
                      return;
                    }
                    activate(pile.slot, spot.count);
                  }}
                  onDoubleClick={() => {
                    if (spot.count === 1 && !justMoved.current) onAuto(pile.slot);
                  }}
                  onKeyDown={(e) => onKeyDown(e, pile, index)}
                  className={cx(
                    'absolute rounded-sm lumen-focus',
                    'transition-[translate] duration-(--duration-fast) ease-(--ease-standard)',
                    picked && '-translate-y-1',
                  )}
                  style={{ left: spot.x, top: spot.y }}
                >
                  {body}
                  {picked && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-sm border-2 border-accent"
                    />
                  )}
                </button>
              );
            })}
            {targets.has(pile.key) && (
              <span
                aria-hidden
                className="pointer-events-none absolute rounded-sm border border-accent"
                style={{
                  left: landing?.x ?? 0,
                  top: (landing?.y ?? 0) + (landing && pile.slot.kind === 'tableau' ? 8 : 0),
                  width: metrics.cardWidth,
                  height: metrics.cardHeight,
                }}
              />
            )}
          </div>
        );
      })}
      {drag && carried.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <div
            ref={layer}
            className="absolute left-0 top-0"
            style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }}
          >
            {carried.map((card, index) => (
              <div key={card.id} className="absolute" style={{ top: index * metrics.upStep }}>
                <CardFace
                  card={card}
                  width={metrics.cardWidth}
                  height={metrics.cardHeight}
                  className="shadow-md"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

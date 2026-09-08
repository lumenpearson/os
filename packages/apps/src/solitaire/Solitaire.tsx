/**
 * Klondike. The rules, the deal and the table are elsewhere and pure; this is
 * the window around them: the deal in progress, the clock, the menus, and what
 * goes to disk.
 *
 * The game in progress is written under the user's home after every move, so
 * closing the window mid-deal and coming back the next day carries on where it
 * was — with the undo history spent, which is the honest cost of putting a
 * deal down.
 */

import { useKernel } from '@lumen/kernel/react';
import { AppFrame, Button, Toolbar, ToolbarSpacer, useElementSize } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { RotateCcw, Shuffle, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import type { Slot } from './deal';
import { canUndo, newGame, reduce, won } from './game';
import { formatClock, formatMoves, statusLine } from './labels';
import { fitTable } from './layout';
import { buildSolitaireMenus } from './menus';
import type { DrawCount, Move } from './rules';
import { type Selection, SolitaireTable } from './SolitaireTable';
import { DEFAULT_DATA, fromStored, normalizeData, type SolitaireData, toStored } from './storage';

/** A deal is a shuffle, and a shuffle is a number. */
function freshSeed(): number {
  return Math.floor(Math.random() * 0xffff_ffff);
}

export default function Solitaire(_props: AppProps) {
  const kernel = useKernel();
  const { close } = useWindowControls();
  const [stored, store, { loaded }] = useJsonFile<SolitaireData>(
    join(kernel.home, '.config', 'solitaire.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [game, setGame] = useState(() => newGame(freshSeed(), data.draw));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [seconds, setSeconds] = useState(0);
  const restored = useRef(false);

  // The file arrives a tick after the window; the deal it carries replaces the
  // one dealt on the way in, once, and only if it is still whole.
  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    const back = fromStored(data.game, data.draw);
    if (back) {
      setGame(back.game);
      setSeconds(back.seconds);
    }
  }, [loaded, data.game, data.draw]);

  const solved = won(game);

  // The clock runs while there is a deal to finish and stops when it is out.
  useEffect(() => {
    if (solved) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [solved]);

  const persist = useCallback(
    (next: typeof game, elapsed: number) => {
      store((prev) => ({ ...normalizeData(prev), game: toStored(next, elapsed) }));
    },
    [store],
  );

  const apply = useCallback(
    (action: Parameters<typeof reduce>[1]) => {
      setGame((current) => {
        const next = reduce(current, action);
        // reduce returns the same object when a move was not legal, so this
        // neither writes the file nor clears a selection the player still has.
        if (next === current) return current;
        setSelection(null);
        persist(next, seconds);
        return next;
      });
    },
    [persist, seconds],
  );

  const deal = useCallback(
    (draw: DrawCount = data.draw) => {
      const next = newGame(freshSeed(), draw);
      setGame(next);
      setSelection(null);
      setSeconds(0);
      store((prev) => ({ ...normalizeData(prev), draw, game: toStored(next, 0) }));
    },
    [data.draw, store],
  );

  useTitle(solved ? 'Solitaire — solved' : 'Solitaire');

  useAppMenus(
    buildSolitaireMenus(
      { canUndo: canUndo(game), draw: game.draw, timer: data.timer },
      {
        newDeal: () => deal(),
        restart: () => apply({ type: 'restart' }),
        undo: () => apply({ type: 'undo' }),
        close: () => void close(),
        setDraw: (draw) => {
          apply({ type: 'setDraw', draw });
          store((prev) => ({ ...normalizeData(prev), draw }));
        },
        toggleTimer: () =>
          store((prev) => {
            const current = normalizeData(prev);
            return { ...current, timer: !current.timer };
          }),
      },
    ),
    [game, data.timer, apply, deal, store, close],
  );

  const [tableRef, size] = useElementSize<HTMLDivElement>();
  const metrics = useMemo(() => fitTable({ width: size.width, height: size.height }), [size]);
  // What is left for the tableau once the top row and the gaps have had theirs.
  const columnHeight = Math.max(metrics.cardHeight, size.height - metrics.tableauTop - metrics.gap);

  return (
    <AppFrame
      toolbar={
        <Toolbar dense windowControls>
          {/*
            The window has no title bar of its own now, so this row names it.
            The deal's own state stays on the status bar, where it already was.
            A plain span is also somewhere the window can be dragged from.
          */}
          <span className="truncate-1 min-w-0 pr-1 text-base font-medium text-ink">Solitaire</span>
          <Button size="sm" icon={<Shuffle className="size-3.5" />} onClick={() => deal()}>
            New Deal
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => apply({ type: 'restart' })}
          >
            Restart
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 className="size-3.5" />}
            disabled={!canUndo(game)}
            onClick={() => apply({ type: 'undo' })}
          >
            Undo
          </Button>
          <ToolbarSpacer />
          {data.timer && (
            <span className="mono shrink-0 text-sm tabular-nums text-ink-2">
              {formatClock(seconds)}
            </span>
          )}
        </Toolbar>
      }
      statusBar={
        <>
          <span className="tabular-nums">{formatMoves(game.moves)}</span>
          <span className="text-ink-3">{statusLine(game)}</span>
        </>
      }
    >
      <div ref={tableRef} className="lumen-scroll min-h-0 min-w-0 flex-1">
        <SolitaireTable
          game={game}
          metrics={metrics}
          columnHeight={columnHeight}
          selection={selection}
          onSelect={setSelection}
          onMove={(move: Move) => apply({ type: 'move', move })}
          onDraw={() => apply({ type: 'draw' })}
          onAuto={(from: Slot) => apply({ type: 'auto', from })}
        />
      </div>
    </AppFrame>
  );
}

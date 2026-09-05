/**
 * 2048. The board and the rules live in board.ts and game.ts; this is the
 * window around them — the score, the two commands, and the file under the
 * user's home that remembers the game between sessions.
 */

import { useKernel } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  cx,
  Toolbar,
  ToolbarSpacer,
  useElementSize,
  useLatest,
  VisuallyHidden,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { Plus, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useNotify, useWindowControls } from '../_sdk';
import type { Direction } from './board';
import { canUndo, type GameState, move, newGame, undo } from './game';
import { boardSummary, formatMoves, formatScore, statusMessage } from './labels';
import { fitBoard } from './layout';
import { buildTwenty48Menus } from './menus';
import {
  DEFAULT_DATA,
  fromStored,
  normalizeData,
  recordBest,
  type Twenty48Data,
  toStored,
} from './storage';
import { Twenty48Board } from './Twenty48Board';

/** Under this the score line drops a size so it still fits beside the best. */
const NARROW = 380;

export default function Twenty48(_props: AppProps) {
  const kernel = useKernel();
  const { close } = useWindowControls();
  const notify = useNotify();

  const [stored, store, { loaded }] = useJsonFile<Twenty48Data>(
    join(kernel.home, '.config', '2048.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [game, setGame] = useState<GameState | null>(null);
  const [frame, windowSize] = useElementSize<HTMLDivElement>();
  const [field, area] = useElementSize<HTMLDivElement>();
  const layout = useMemo(() => fitBoard(area), [area]);

  /** Set once the win has been mentioned, so it is mentioned once. */
  const congratulated = useRef(false);

  // The saved game arrives after the first render. Take it when it lands, and
  // deal a fresh board if there was none — but only ever once, so a later
  // write of the file cannot restart the game under the player's hands.
  const savedGame = useLatest(data.game);
  const adopted = useRef(false);
  useEffect(() => {
    if (!loaded || adopted.current) return;
    adopted.current = true;
    const restored = fromStored(savedGame.current);
    congratulated.current = restored?.won ?? false;
    setGame(restored ?? newGame(Math.random));
  }, [loaded, savedGame]);

  useEffect(() => {
    if (!game) return;
    store((previous) =>
      recordBest({ ...normalizeData(previous), game: toStored(game) }, game.score),
    );
  }, [game, store]);

  useEffect(() => {
    if (!game?.won || congratulated.current) return;
    congratulated.current = true;
    notify('2048', 'You made a 2048 tile. The game carries on.');
  }, [game?.won, notify]);

  const patch = useCallback(
    (change: Partial<Twenty48Data>) => {
      store((previous) => ({ ...normalizeData(previous), ...change }));
    },
    [store],
  );

  const start = useCallback(() => setGame(newGame(Math.random)), []);
  const slide = useCallback((direction: Direction) => {
    setGame((current) => (current ? move(current, direction, Math.random) : current));
  }, []);
  const stepBack = useCallback(() => setGame((current) => (current ? undo(current) : current)), []);

  const latest = useLatest({
    newGame: start,
    undo: stepBack,
    close,
    toggleBest: () => patch({ showBest: !data.showBest }),
    toggleAnimations: () => patch({ animations: !data.animations }),
  });

  useAppMenus(
    buildTwenty48Menus(
      {
        canUndo: game !== null && canUndo(game),
        showBest: data.showBest,
        animations: data.animations,
      },
      {
        newGame: () => latest.current.newGame(),
        undo: () => latest.current.undo(),
        close: () => latest.current.close(),
        toggleBest: () => latest.current.toggleBest(),
        toggleAnimations: () => latest.current.toggleAnimations(),
      },
    ),
    [game, data.showBest, data.animations],
  );

  const best = Math.max(data.best, game?.score ?? 0);
  const narrow = windowSize.width > 0 && windowSize.width < NARROW;

  return (
    <div ref={frame} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={start}>
              New game
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 className="size-3.5" />}
              disabled={game === null || !canUndo(game)}
              onClick={stepBack}
            >
              Undo
            </Button>
            <ToolbarSpacer />
            {!narrow && game !== null && (
              <span className="mono text-xs tabular-nums text-ink-3">
                {formatMoves(game.moves)}
              </span>
            )}
          </Toolbar>
        }
        statusBar={<span>{game ? statusMessage(game) : 'Reading the saved game…'}</span>}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline gap-2.5 px-3 pt-2.5 pb-1">
            <span className="text-sm text-ink-2">Score</span>
            <span className={cx('mono tabular-nums text-ink', narrow ? 'text-lg' : 'text-xl')}>
              {formatScore(game?.score ?? 0)}
            </span>
            {data.showBest && (
              <>
                <span className="ml-auto text-sm text-ink-2">Best</span>
                <span
                  className={cx('mono tabular-nums text-ink-2', narrow ? 'text-md' : 'text-lg')}
                >
                  {formatScore(best)}
                </span>
              </>
            )}
          </div>

          <div ref={field} className="lumen-scroll flex min-h-0 flex-1 p-3">
            <div className="m-auto">
              {game && (
                <Twenty48Board
                  state={game}
                  layout={layout}
                  animate={data.animations}
                  onSlide={slide}
                />
              )}
            </div>
          </div>
        </div>

        <VisuallyHidden>
          <span role="status" aria-live="polite">
            {game ? boardSummary(game) : ''}
          </span>
        </VisuallyHidden>
      </AppFrame>
    </div>
  );
}

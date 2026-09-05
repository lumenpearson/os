/**
 * Chess against the engine in engine.ts.
 *
 * The search runs in slices. `deepen` is a generator that yields once per
 * iteration of iterative deepening, so the window is handed back between them
 * rather than freezing for the whole think — a depth-5 search on a busy
 * middlegame is comfortably long enough to notice. Each slice is scheduled on
 * a timeout, and an abort flag makes a search that is no longer wanted (a new
 * game, a take back) drop its result instead of playing it.
 */

import { useClipboardStore } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { RotateCcw, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { type Color, kingSquare, type PromotionPiece } from './board';
import { Chessboard } from './Chessboard';
import { chooseMove, deepen, type LevelId, levelById, type RootMove } from './engine';
import { INITIAL_FEN, toFen } from './fen';
import {
  canMove,
  current,
  engineToMove,
  type Game,
  gameFromFen,
  moveRows,
  newGame,
  play,
  keys as positionKeys,
  resign,
  shown,
  status,
  stepView,
  takeBack,
  toPgn,
  view,
} from './game';
import { MoveList } from './MoveList';
import { buildChessMenus } from './menus';
import { type Move, movesFrom } from './moves';
import { inCheck } from './rules';

interface Prefs {
  side: Color;
  level: LevelId;
  flipped: boolean;
  coordinates: boolean;
  targets: boolean;
}

const DEFAULT_PREFS: Prefs = {
  side: 'w',
  level: 'casual',
  flipped: false,
  coordinates: true,
  targets: true,
};

function normalize(value: Prefs): Prefs {
  const side: Color = value?.side === 'b' ? 'b' : 'w';
  return {
    side,
    level: levelById(String(value?.level ?? '')).id,
    flipped: Boolean(value?.flipped),
    coordinates: value?.coordinates !== false,
    targets: value?.targets !== false,
  };
}

/** Below this the move list sits under the board instead of beside it. */
const SIDE_BY_SIDE = 720;

export default function Chess(_props: AppProps) {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { close } = useWindowControls();
  const [frameRef, { width }] = useElementSize<HTMLDivElement>();

  const [stored, setStored] = useJsonFile(
    join(kernel.home, '.config', 'chess.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalize(stored), [stored]);

  const [game, setGame] = useState<Game>(() => newGame(prefs.side, prefs.level));
  const [selected, setSelected] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  /** Bumped whenever a search must be abandoned. */
  const generation = useRef(0);

  const position = shown(game);
  const live = current(game);
  const result = status(game);
  const over = result.kind !== 'playing';
  const lastMove = game.played[game.played.length - 1]?.move ?? null;
  const viewingPly = game.viewing ?? game.played.length;

  const targets = useMemo(
    () => (selected === null || !canMove(game) ? [] : movesFrom(live, selected)),
    [selected, live, game],
  );

  useTitle(over ? `Chess — ${describe(result, game.side)}` : 'Chess');

  const setPrefs = useCallback(
    (patch: Partial<Prefs>) => setStored((c) => ({ ...normalize(c), ...patch })),
    [setStored],
  );

  const start = useCallback(
    (side: Color, level: LevelId) => {
      generation.current += 1;
      setThinking(false);
      setSelected(null);
      setGame(newGame(side, level));
      setPrefs({ side, level, flipped: side === 'b' });
    },
    [setPrefs],
  );

  // ── the engine ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!engineToMove(game) || game.viewing !== null) return;
    generation.current += 1;
    const mine = generation.current;
    setThinking(true);
    const level = levelById(game.level);
    const steps = deepen(current(game), {
      depth: level.depth,
      nodes: level.nodes,
      timeMs: level.timeMs,
      history: positionKeys(game),
    });
    let best: RootMove[] = [];
    let timer: ReturnType<typeof setTimeout>;

    /**
     * One iteration per turn of the event loop. Between them the browser gets
     * to paint, so the board stays responsive while the engine thinks.
     */
    const slice = () => {
      if (generation.current !== mine) return;
      const step = steps.next();
      if (!step.done && step.value) best = step.value.moves;
      if (step.done) {
        if (generation.current !== mine) return;
        const move = chooseMove(best, level.slack);
        setThinking(false);
        if (move) setGame((g) => (engineToMove(g) ? play(g, move) : g));
        return;
      }
      timer = setTimeout(slice, 0);
    };
    timer = setTimeout(slice, 30);

    return () => {
      clearTimeout(timer);
    };
  }, [game]);

  // ── moving ─────────────────────────────────────────────────────────────

  const onMove = useCallback(
    async (from: number, to: number) => {
      const options = movesFrom(live, from).filter((m) => m.to === to);
      if (options.length === 0) return;
      let move: Move | undefined = options[0];
      if (options.length > 1 && options.some((m) => m.promotion)) {
        const chosen = await dialogs.choose({
          title: 'Promote the pawn to',
          buttons: [
            { id: 'n', label: 'Knight', variant: 'secondary' },
            { id: 'r', label: 'Rook', variant: 'secondary' },
            { id: 'b', label: 'Bishop', variant: 'secondary' },
            { id: 'q', label: 'Queen', variant: 'primary' },
          ],
        });
        if (!chosen) return;
        move = options.find((m) => m.promotion === (chosen as PromotionPiece));
      }
      if (!move) return;
      setSelected(null);
      setGame((g) => play(g, move as Move));
    },
    [dialogs, live],
  );

  const latest = useLatest({
    newGame: () => start(prefs.side, prefs.level),
    newGameAs: (white: boolean) => start(white ? 'w' : 'b', prefs.level),
    takeBack: () => {
      generation.current += 1;
      setThinking(false);
      setSelected(null);
      setGame(takeBack);
    },
    resign: () => setGame(resign),
    flip: () => setPrefs({ flipped: !prefs.flipped }),
    close,
    copyFen: () => useClipboardStore.getState().copyText(toFen(position)),
    copyPgn: () => useClipboardStore.getState().copyText(toPgn(game, new Date())),
    pasteFen: async () => {
      const text = await dialogs.prompt({
        title: 'Set up a position',
        message: 'Paste a FEN. The side to move and the castling rights come from it.',
        defaultValue: INITIAL_FEN,
        mono: true,
      });
      if (!text) return;
      const made = gameFromFen(text.trim(), prefs.side, prefs.level);
      if (typeof made === 'string') {
        await dialogs.alert({ title: 'That is not a position', message: made });
        return;
      }
      generation.current += 1;
      setThinking(false);
      setSelected(null);
      setGame(made);
    },
    setLevel: (level: LevelId) => {
      setPrefs({ level });
      setGame((g) => ({ ...g, level }));
    },
    toggleCoordinates: () => setPrefs({ coordinates: !prefs.coordinates }),
    toggleTargets: () => setPrefs({ targets: !prefs.targets }),
    first: () => setGame((g) => view(g, 0)),
    previous: () => setGame((g) => stepView(g, -1)),
    next: () => setGame((g) => stepView(g, 1)),
    last: () => setGame((g) => view(g, null)),
  });

  useAppMenus(
    buildChessMenus(
      {
        canTakeBack: game.played.length > 0,
        canResign: !over,
        flipped: prefs.flipped,
        coordinates: prefs.coordinates,
        targets: prefs.targets,
        level: prefs.level,
        asWhite: game.side === 'w',
      },
      {
        newGame: () => latest.current.newGame(),
        newGameAs: (white) => latest.current.newGameAs(white),
        takeBack: () => latest.current.takeBack(),
        resign: () => latest.current.resign(),
        flip: () => latest.current.flip(),
        close: () => latest.current.close(),
        copyFen: () => latest.current.copyFen(),
        copyPgn: () => latest.current.copyPgn(),
        pasteFen: () => void latest.current.pasteFen(),
        setLevel: (level) => latest.current.setLevel(level),
        toggleCoordinates: () => latest.current.toggleCoordinates(),
        toggleTargets: () => latest.current.toggleTargets(),
        first: () => latest.current.first(),
        previous: () => latest.current.previous(),
        next: () => latest.current.next(),
        last: () => latest.current.last(),
      },
    ),
    [game, prefs, over, close],
  );

  const beside = width === 0 || width >= SIDE_BY_SIDE;
  const checked = inCheck(position) ? kingSquare(position.board, position.turn) : null;

  return (
    <div ref={frameRef} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense>
            <Button size="sm" variant="secondary" onClick={() => latest.current.newGame()}>
              New game
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 className="size-3.5" />}
              disabled={game.played.length === 0}
              onClick={() => latest.current.takeBack()}
            >
              Take back
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw className="size-3.5" />}
              onClick={() => latest.current.flip()}
            >
              Flip
            </Button>
            <ToolbarSpacer />
            <span className="mono text-xs text-ink-2">{levelById(prefs.level).label}</span>
          </Toolbar>
        }
        statusBar={
          <>
            <span>{describe(result, game.side)}</span>
            {thinking && <span className="text-ink-3">Thinking…</span>}
            {game.viewing !== null && (
              <button
                type="button"
                onClick={() => latest.current.last()}
                className="text-accent lumen-focus"
              >
                Looking back — return to the game
              </button>
            )}
          </>
        }
      >
        <div
          className={
            beside ? 'flex min-h-0 flex-1 gap-3 p-3' : 'flex min-h-0 flex-1 flex-col gap-2 p-2'
          }
        >
          <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center">
            <Chessboard
              position={position}
              flipped={prefs.flipped}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              checkedKing={checked}
              interactive={canMove(game) && !thinking}
              showCoordinates={prefs.coordinates}
              showTargets={prefs.targets}
              onSelect={setSelected}
              onMove={(from, to) => void onMove(from, to)}
            />
          </div>
          <div
            className={
              beside
                ? 'flex w-52 shrink-0 flex-col rounded-sm border border-rule bg-canvas'
                : 'flex h-32 shrink-0 flex-col rounded-sm border border-rule bg-canvas'
            }
          >
            <MoveList
              rows={moveRows(game)}
              at={viewingPly}
              onSelect={(ply) => setGame((g) => view(g, ply))}
            />
          </div>
        </div>
      </AppFrame>
    </div>
  );
}

/** What has happened, in a line the status bar can show. */
function describe(result: ReturnType<typeof status>, side: Color): string {
  switch (result.kind) {
    case 'checkmate':
      return `Checkmate — ${result.winner === side ? 'you win' : 'Lumen wins'}`;
    case 'resignation':
      return `${result.winner === side ? 'Lumen resigned' : 'You resigned'}`;
    case 'draw':
      return `Draw by ${result.reason.replace(/-/g, ' ')}`;
    default:
      return result.check ? 'Check' : 'Playing';
  }
}

/**
 * Chess against the engine in engine.ts.
 *
 * The search runs in slices. `deepen` is a generator that yields once per
 * iteration of iterative deepening, so the window is handed back between them
 * rather than freezing for the whole think — a depth-5 search on a busy
 * middlegame is comfortably long enough to notice. Each slice is scheduled on
 * a timeout, and an abort flag makes a search that is no longer wanted (a new
 * game, a take back) drop its result instead of playing it.
 *
 * The person may play either colour. Choosing Black flips the board and leaves
 * White to the engine, which then has the first move — the same effect that
 * plays every other engine move, with nothing special about the opening.
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
import {
  type AppProps,
  useAppMenus,
  useJsonFile,
  useShortcutLabel,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { type Color, kingSquare, opposite, type PromotionPiece } from './board';
import { CapturedPieces } from './CapturedPieces';
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
  redo,
  resign,
  restart,
  shown,
  status,
  stepView,
  takeBack,
  toPgn,
  undo,
  view,
} from './game';
import { MoveList } from './MoveList';
import { material } from './material';
import { buildChessMenus } from './menus';
import { type Move, movesFrom } from './moves';
import { inCheck, type Outcome, resultToken } from './rules';
import { colorName, SIDE_CHOICES, sideChoiceLabel, sideFromAnswer } from './side';

interface Prefs {
  side: Color;
  level: LevelId;
  flipped: boolean;
  coordinates: boolean;
  /** Dots on the squares the selected piece may go to. */
  targets: boolean;
  lastMove: boolean;
  captured: boolean;
  moveList: boolean;
}

const DEFAULT_PREFS: Prefs = {
  side: 'w',
  level: 'casual',
  flipped: false,
  coordinates: true,
  targets: true,
  lastMove: true,
  captured: true,
  moveList: true,
};

function normalize(value: Prefs): Prefs {
  const side: Color = value?.side === 'b' ? 'b' : 'w';
  return {
    side,
    level: levelById(String(value?.level ?? '')).id,
    flipped: value?.flipped === undefined ? side === 'b' : Boolean(value.flipped),
    coordinates: value?.coordinates !== false,
    targets: value?.targets !== false,
    lastMove: value?.lastMove !== false,
    captured: value?.captured !== false,
    moveList: value?.moveList !== false,
  };
}

/** Below this the move list sits under the board instead of beside it. */
const SIDE_BY_SIDE = 720;

/**
 * Below this the side and level leave the toolbar. The window controls sit in
 * that row now, and the three buttons come first; the Game menu marks the
 * level and the status bar says whose move it is.
 */
const SIDE_AND_LEVEL_FROM = 480;

const HOW_TO_PLAY: ReadonlyArray<readonly [string, string]> = [
  ['Click or drag', 'Move a piece. The legal squares are marked as you pick it up.'],
  ['Arrow keys', 'Walk the board. Enter picks a piece up and puts it down.'],
  ['Mod+Backspace', 'Take back your last move and the reply to it.'],
  ['Mod+Left / Mod+Right', 'Step through the game. Any move in the list can be clicked.'],
  ['Mod+F', 'Turn the board round.'],
];

export default function Chess(_props: AppProps) {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { close } = useWindowControls();
  const shortcutLabel = useShortcutLabel();
  const [frameRef, { width }] = useElementSize<HTMLDivElement>();

  const [stored, setStored, file] = useJsonFile(
    join(kernel.home, '.config', 'chess.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalize(stored), [stored]);

  const [game, setGame] = useState<Game>(() => newGame(prefs.side, prefs.level));
  const [selected, setSelected] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  /** Bumped whenever a search must be abandoned. */
  const generation = useRef(0);
  const adopted = useRef(false);

  const position = shown(game);
  const live = current(game);
  const result = status(game);
  const over = result.kind !== 'playing';
  const lastMove = game.played[game.played.length - 1]?.move ?? null;
  const viewingPly = game.viewing ?? game.played.length;
  const balance = useMemo(() => material(game.start, position), [game.start, position]);

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

  /**
   * The settings file arrives a tick after the window does, so the first game
   * is dealt on the defaults. Once the file has been read, a game nobody has
   * moved in is dealt again on the side it remembers — which is how a person
   * who plays Black gets Black back when they reopen the window.
   */
  useEffect(() => {
    if (adopted.current || !file.loaded) return;
    adopted.current = true;
    setGame((g) =>
      g.played.length === 0 && (g.side !== prefs.side || g.level !== prefs.level)
        ? newGame(prefs.side, prefs.level)
        : g,
    );
  }, [file.loaded, prefs.side, prefs.level]);

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

  /** Abandon whatever the engine is doing and put the board back in hand. */
  const interrupt = useCallback(() => {
    generation.current += 1;
    setThinking(false);
    setSelected(null);
  }, []);

  const latest = useLatest({
    newGame: async () => {
      // The buttons run backwards so that White, the usual answer, is the
      // last one: a dialog's default sits at the right and takes the Return.
      const answer = await dialogs.choose({
        title: 'New game',
        message: 'Which side do you play? The engine takes the other.',
        buttons: [...SIDE_CHOICES]
          .reverse()
          .map((choice) => ({ id: choice, label: sideChoiceLabel(choice) })),
      });
      const side = sideFromAnswer(answer);
      if (side) start(side, prefs.level);
    },
    newGameAs: (side: Color) => start(side, prefs.level),
    restart: () => {
      interrupt();
      setGame(restart);
    },
    undo: () => {
      interrupt();
      setGame(undo);
    },
    redo: () => {
      interrupt();
      setGame(redo);
    },
    takeBack: () => {
      interrupt();
      setGame(takeBack);
    },
    resign: async () => {
      const sure = await dialogs.confirm({
        title: 'Resign this game?',
        message: `The game goes to ${colorName(opposite(game.side))}. The moves stay on the list.`,
        confirmLabel: 'Resign',
        danger: true,
      });
      if (sure) setGame(resign);
    },
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
      interrupt();
      setGame(made);
    },
    setLevel: (level: LevelId) => {
      setPrefs({ level });
      setGame((g) => ({ ...g, level }));
    },
    toggleCoordinates: () => setPrefs({ coordinates: !prefs.coordinates }),
    toggleTargets: () => setPrefs({ targets: !prefs.targets }),
    toggleLastMove: () => setPrefs({ lastMove: !prefs.lastMove }),
    toggleCaptured: () => setPrefs({ captured: !prefs.captured }),
    toggleMoveList: () => setPrefs({ moveList: !prefs.moveList }),
    first: () => setGame((g) => view(g, 0)),
    previous: () => setGame((g) => stepView(g, -1)),
    next: () => setGame((g) => stepView(g, 1)),
    last: () => setGame((g) => view(g, null)),
    howToPlay: () =>
      void dialogs.alert({
        title: 'How to play',
        message: (
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-base">
            {HOW_TO_PLAY.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="mono text-sm text-ink-2">
                  {keys.includes('Mod') ? shortcutLabel(keys) : keys}
                </dt>
                <dd className="text-ink">{what}</dd>
              </div>
            ))}
          </dl>
        ),
      }),
    about: () =>
      void dialogs.alert({
        title: 'Chess',
        message:
          'The complete rules — castling, en passant, promotion, the three draws — checked against the published perft counts. The opponent searches with alpha-beta over a material and piece-square evaluation, at four strengths.',
      }),
  });

  useAppMenus(
    buildChessMenus(
      {
        canTakeBack: game.played.length > 0,
        canUndo: game.played.length > 0,
        canRedo: game.undone.length > 0,
        canRestart: game.played.length > 0 || game.undone.length > 0,
        canResign: !over,
        flipped: prefs.flipped,
        coordinates: prefs.coordinates,
        lastMove: prefs.lastMove,
        hints: prefs.targets,
        captured: prefs.captured,
        moveList: prefs.moveList,
        level: prefs.level,
        side: game.side,
      },
      {
        newGame: () => void latest.current.newGame(),
        newGameAs: (side) => latest.current.newGameAs(side),
        restart: () => latest.current.restart(),
        undo: () => latest.current.undo(),
        redo: () => latest.current.redo(),
        takeBack: () => latest.current.takeBack(),
        resign: () => void latest.current.resign(),
        close: () => latest.current.close(),
        copyFen: () => latest.current.copyFen(),
        copyPgn: () => latest.current.copyPgn(),
        pasteFen: () => void latest.current.pasteFen(),
        flip: () => latest.current.flip(),
        toggleCoordinates: () => latest.current.toggleCoordinates(),
        toggleLastMove: () => latest.current.toggleLastMove(),
        toggleHints: () => latest.current.toggleTargets(),
        toggleCaptured: () => latest.current.toggleCaptured(),
        toggleMoveList: () => latest.current.toggleMoveList(),
        first: () => latest.current.first(),
        previous: () => latest.current.previous(),
        next: () => latest.current.next(),
        last: () => latest.current.last(),
        setLevel: (level) => latest.current.setLevel(level),
        howToPlay: () => latest.current.howToPlay(),
        about: () => latest.current.about(),
      },
    ),
    [game, prefs, over, close],
  );

  const beside = width === 0 || width >= SIDE_BY_SIDE;
  const checked = inCheck(position) ? kingSquare(position.board, position.turn) : null;
  const panel = prefs.captured || prefs.moveList;
  // The side at the top of the board owns the top row of captures, so the
  // pieces sit on the side of the panel the player they belong to is on.
  const above = prefs.flipped ? 'w' : 'b';

  return (
    <div ref={frameRef} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense windowControls>
            {/* The window has no title bar of its own, so this row names it. */}
            <span className="truncate-1 mr-1 min-w-0 text-base font-medium text-ink">Chess</span>
            <Button size="sm" variant="secondary" onClick={() => void latest.current.newGame()}>
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
            {(width === 0 || width >= SIDE_AND_LEVEL_FROM) && (
              <span className="mono text-xs text-ink-2">
                {colorName(game.side)} · {levelById(prefs.level).label}
              </span>
            )}
          </Toolbar>
        }
        statusBar={
          <>
            <span>{describe(result, game.side)}</span>
            {thinking && <span className="text-ink-3">Thinking…</span>}
            {game.undone.length > 0 && (
              <span className="text-ink-3">
                {game.undone.length === 1
                  ? '1 move taken back'
                  : `${game.undone.length} moves taken back`}
              </span>
            )}
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
          <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center [container-type:size]">
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
              showLastMove={prefs.lastMove}
              onSelect={setSelected}
              onMove={(from, to) => void onMove(from, to)}
            />
          </div>
          {panel && (
            <aside
              aria-label="Score sheet"
              className={
                beside
                  ? 'flex w-56 shrink-0 flex-col rounded-sm border border-rule bg-canvas'
                  : 'flex h-36 shrink-0 flex-col rounded-sm border border-rule bg-canvas'
              }
            >
              {prefs.captured && (
                <div className="shrink-0 border-b border-rule">
                  <CapturedPieces
                    color={above}
                    taken={balance.lost[opposite(above)]}
                    balance={balance.balance}
                  />
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col">
                {prefs.moveList && (
                  <MoveList
                    rows={moveRows(game)}
                    at={viewingPly}
                    result={over ? resultToken(result) : undefined}
                    onSelect={(ply) => setGame((g) => view(g, ply))}
                  />
                )}
              </div>
              {prefs.captured && (
                <div className="shrink-0 border-t border-rule">
                  <CapturedPieces
                    color={opposite(above)}
                    taken={balance.lost[above]}
                    balance={balance.balance}
                  />
                </div>
              )}
            </aside>
          )}
        </div>
      </AppFrame>
    </div>
  );
}

/** What has happened, in a line the status bar can show. */
function describe(result: Outcome, side: Color): string {
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

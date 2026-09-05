import { useKernel } from '@lumen/kernel/react';
import { Button, Toolbar, ToolbarSpacer, useElementSize, useLatest } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { Clock, Flag, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AppProps, useApp, useAppMenus, useJsonFile } from '../_sdk';
import { BestTimesDialog } from './BestTimesDialog';
import { Board } from './Board';
import { CustomDialog } from './CustomDialog';
import { type BoardConfig, DIFFICULTY_LABEL, describeConfig, presetOf } from './difficulty';
import { formatClock, statusMessage } from './labels';
import { fitCell } from './layout';
import { buildMinesweeperMenus } from './menus';
import {
  activate,
  createGame,
  cycleMark,
  elapsedMs,
  type GameState,
  remainingMines,
  setQuestionMarks,
} from './reveal';
import { randomSeed } from './rng';
import {
  clearBestTimes,
  configFor,
  DEFAULT_DATA,
  isBestTime,
  type MinesweeperData,
  normalizeData,
  recordTime,
} from './storage';

/** The clock is read to the second; a fifth of that keeps it honest. */
const TICK_MS = 200;

type Sheet = 'none' | 'custom' | 'best-times';

export default function Minesweeper(_props: AppProps) {
  const kernel = useKernel();
  const { container } = useApp();
  const [stored, store] = useJsonFile<MinesweeperData>(
    join(kernel.home, '.config', 'minesweeper.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const config = useMemo(() => configFor(data), [data]);

  const [game, setGame] = useState<GameState>(() =>
    createGame(config, { seed: randomSeed(), questionMarks: data.questionMarks }),
  );
  const [cursor, setCursor] = useState(0);
  const [record, setRecord] = useState(false);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [now, setNow] = useState(() => Date.now());
  const [field, area] = useElementSize<HTMLDivElement>();

  const patch = (change: Partial<MinesweeperData>) =>
    store((previous) => ({ ...normalizeData(previous), ...change }));

  const start = useCallback((next: BoardConfig, questionMarks: boolean) => {
    setGame(createGame(next, { seed: randomSeed(), questionMarks }));
    setCursor(0);
    setRecord(false);
    setNow(Date.now());
  }, []);

  // A different board shape is a different game — including the moment the
  // settings file lands and names a difficulty other than the default.
  const shape = `${config.width}×${config.height}×${config.mines}`;
  const latestConfig = useLatest(config);
  const latestQuestionMarks = useLatest(data.questionMarks);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the shape decides when to deal a new board, not the identity of the config object
  useEffect(() => {
    start(latestConfig.current, latestQuestionMarks.current);
  }, [shape, start, latestConfig, latestQuestionMarks]);

  // Switching the option off clears the marks already on the board; switching
  // it on does not disturb a game in progress.
  useEffect(() => {
    setGame((current) => setQuestionMarks(current, data.questionMarks));
  }, [data.questionMarks]);

  useEffect(() => {
    if (game.phase !== 'playing') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [game.phase]);

  /** A win on one of the three presets is the only time worth keeping. */
  const keepTime = (won: GameState) => {
    const preset = presetOf(won.config);
    if (!preset) return;
    const ms = elapsedMs(won, won.finishedAt ?? Date.now());
    if (!isBestTime(data, preset, ms)) return;
    setRecord(true);
    store((previous) => recordTime(normalizeData(previous), preset, ms, Date.now()));
  };

  const apply = (next: GameState) => {
    if (next === game) return;
    setNow(Date.now());
    setGame(next);
    if (next.phase === 'won' && game.phase !== 'won') keepTime(next);
  };

  useAppMenus(
    buildMinesweeperMenus(
      { difficulty: data.difficulty, questionMarks: data.questionMarks },
      {
        newGame: () => start(config, data.questionMarks),
        setDifficulty: (id) => patch({ difficulty: id }),
        openCustom: () => setSheet('custom'),
        openBestTimes: () => setSheet('best-times'),
        toggleQuestionMarks: () => patch({ questionMarks: !data.questionMarks }),
      },
    ),
    [data, config, start],
  );

  const elapsed = elapsedMs(game, now);
  const status = statusMessage(game, now);
  const message = game.phase === 'won' && record ? `${status} A new best time.` : status;

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-ink">
      <Toolbar dense>
        {/* The live region below reads the count out; the strip is the eye's copy. */}
        <span aria-hidden className="flex items-center gap-1.5 text-ink-3">
          <Flag className="size-3.5" />
          <span className="mono tabular-nums text-md text-ink">{remainingMines(game)}</span>
        </span>
        <ToolbarSpacer />
        <Button
          size="sm"
          icon={<RotateCcw className="size-3.5" />}
          onClick={() => start(config, data.questionMarks)}
        >
          New Game
        </Button>
        <ToolbarSpacer />
        <span aria-hidden className="flex items-center gap-1.5 text-ink-3">
          <Clock className="size-3.5" />
          <span className="mono tabular-nums text-md text-ink">{formatClock(elapsed)}</span>
        </span>
      </Toolbar>

      <div ref={field} className="lumen-scroll flex flex-1 p-3">
        <div className="m-auto">
          <Board
            state={game}
            cursor={cursor}
            cellSize={fitCell(area, config)}
            onCursor={setCursor}
            onActivate={(index) => apply(activate(game, index, Date.now()))}
            onFlag={(index) => apply(cycleMark(game, index))}
          />
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-rule bg-canvas px-3">
        <span className="text-sm text-ink-2">{DIFFICULTY_LABEL[data.difficulty]}</span>
        <span className="mono tabular-nums text-sm text-ink-3">{describeConfig(config)}</span>
        <span role="status" aria-live="polite" className="truncate-1 ml-auto text-sm text-ink-2">
          {message}
        </span>
      </div>

      {sheet === 'custom' && (
        <CustomDialog
          initial={data.difficulty === 'custom' ? data.custom : config}
          container={container}
          onCancel={() => setSheet('none')}
          onStart={(next) => {
            patch({ difficulty: 'custom', custom: next });
            start(next, data.questionMarks);
            setSheet('none');
          }}
        />
      )}

      {sheet === 'best-times' && (
        <BestTimesDialog
          best={data.best}
          container={container}
          onClose={() => setSheet('none')}
          onClear={() => store((previous) => clearBestTimes(normalizeData(previous)))}
        />
      )}
    </div>
  );
}

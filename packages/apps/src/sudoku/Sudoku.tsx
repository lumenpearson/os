/**
 * Sudoku.
 *
 * The whole game is in the modules beside this file; what is left here is the
 * window — where the board and the pad go at a given size, when a puzzle is
 * generated, when the clock runs, and when any of it reaches the disk.
 *
 * Generating a puzzle is synchronous. It is a few milliseconds at the easy
 * grades and a fraction of a second at the hardest, because carving asks only
 * "is there a second solution?" and stops there, so there is nothing here to
 * schedule around.
 */

import { useKernel } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  IconButton,
  Select,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { CheckCheck, Lightbulb, Pencil, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty, generate } from './generate';
import { checkLine, formatClock, progressLine } from './labels';
import { fitCell, padBeside } from './layout';
import { buildSudokuMenus } from './menus';
import { NumberPad } from './NumberPad';
import {
  canRedo,
  canUndo,
  check,
  clearCell,
  conflicts as conflictsOfPlay,
  hint,
  hintTarget,
  isEditable,
  isFinished,
  mistakes,
  type PlayState,
  placed,
  redo,
  setValue,
  startPlay,
  toggleMark,
  undo,
} from './play';
import { createRng, randomSeed } from './rng';
import { SudokuBoard } from './SudokuBoard';
import { DEFAULT_DATA, fromSaved, normalizeData, type SudokuPrefs, toSaved } from './storage';

/** Below this the digit counts on the number pad have no room. */
const COUNTS_FROM = 460;
/** Below this the difficulty select leaves the toolbar; the menu still has it. */
const SELECT_FROM = 480;
/**
 * Below this Undo and Redo leave the toolbar: the window controls now sit in
 * this row, and what is left has to fit beside them at the smallest width.
 * Edit → Undo and Mod+Z are unaffected.
 */
const HISTORY_FROM = 400;
/** The board is written to disk this often while it is being played. */
const SAVE_EVERY = 15_000;

export default function Sudoku(_props: AppProps) {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { close } = useWindowControls();
  const [frame, { width }] = useElementSize<HTMLDivElement>();
  const [field, area] = useElementSize<HTMLDivElement>();

  const [stored, setStored, { loaded }] = useJsonFile(
    join(kernel.home, '.config', 'sudoku.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const prefs = data.prefs;

  const [play, setPlay] = useState<PlayState | null>(null);
  const [cursor, setCursor] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  /** What the last Check or Hint had to say. Cleared by the next move. */
  const [note, setNote] = useState<string | null>(null);

  const finished = play !== null && isFinished(play);
  const running = play !== null && !finished;

  useTitle(finished ? 'Sudoku — solved' : 'Sudoku');

  const setPrefs = useCallback(
    (patch: Partial<SudokuPrefs>) =>
      setStored((current) => {
        const normalized = normalizeData(current);
        return { ...normalized, prefs: { ...normalized.prefs, ...patch } };
      }),
    [setStored],
  );

  const start = useCallback(
    (difficulty: Difficulty) => {
      const seed = randomSeed();
      const made = generate(createRng(seed), difficulty);
      const first = made.puzzle.indexOf(0);
      setPlay(startPlay(made.puzzle, made.solution, made.difficulty, seed));
      setCursor(first === -1 ? 0 : first);
      setElapsed(0);
      setNote(null);
      setPrefs({ difficulty });
    },
    [setPrefs],
  );

  // The saved game if there is a sound one, a new puzzle if there is not.
  // Waits for the file, because a puzzle dealt before it lands would be
  // thrown away the moment it does — and happens once, whatever else changes.
  const restore = useLatest({ game: data.game, difficulty: prefs.difficulty, start });
  const dealt = useRef(false);
  useEffect(() => {
    if (!loaded || dealt.current) return;
    dealt.current = true;
    const saved = fromSaved(restore.current.game);
    if (!saved) {
      restore.current.start(restore.current.difficulty);
      return;
    }
    const first = saved.state.values.indexOf(0);
    setPlay(saved.state);
    setCursor(first === -1 ? 0 : first);
    setElapsed(saved.elapsedMs);
  }, [loaded, restore]);

  // ── the clock ──────────────────────────────────────────────────────────
  // Wall-clock deltas rather than a count of ticks: a background tab throttles
  // timers, and a timer that has been throttled must not lose the minutes.
  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      setElapsed((ms) => ms + delta);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // ── saving ─────────────────────────────────────────────────────────────
  const latest = useLatest({ play, elapsed, loaded });
  const persist = useCallback(() => {
    const { play: current, elapsed: ms, loaded: ready } = latest.current;
    if (!ready || !current) return;
    setStored((stale) => ({ ...normalizeData(stale), game: toSaved(current, ms) }));
  }, [latest, setStored]);

  // Every move, so a crash loses nothing but the seconds since it.
  useEffect(() => {
    if (play) persist();
  }, [play, persist]);

  // And on a slow beat while the clock runs, so the time is kept too.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(persist, SAVE_EVERY);
    return () => clearInterval(id);
  }, [running, persist]);

  useEffect(() => () => persist(), [persist]);

  // ── commands ───────────────────────────────────────────────────────────

  const newPuzzle = useCallback(
    async (difficulty: Difficulty) => {
      if (play && !finished && canUndo(play)) {
        const ok = await dialogs.confirm({
          title: 'Start a new puzzle?',
          message: 'The puzzle you are on will be lost.',
          confirmLabel: 'New Puzzle',
        });
        if (!ok) return;
      }
      start(difficulty);
    },
    [dialogs, finished, play, start],
  );

  const apply = useCallback((next: (state: PlayState) => PlayState) => {
    setNote(null);
    setPlay((current) => (current ? next(current) : current));
  }, []);

  // A solved board takes no more digits, from the pad or the keyboard. Undo
  // is still there for anyone who wants to go back into it.
  const write = useCallback(
    (index: number, digit: number) => {
      setCursor(index);
      if (finished) return;
      apply((state) =>
        prefs.pencil ? toggleMark(state, index, digit) : setValue(state, index, digit),
      );
    },
    [apply, finished, prefs.pencil],
  );

  const erase = useCallback(
    (index: number) => {
      setCursor(index);
      if (finished) return;
      apply((state) => clearCell(state, index));
    },
    [apply, finished],
  );

  const runCheck = useCallback(() => {
    if (!play) return;
    setNote(checkLine(mistakes(play).length));
    setPlay(check(play));
  }, [play]);

  const runHint = useCallback(() => {
    if (!play) return;
    const given = hint(play);
    if (!given) return;
    setPlay(given.state);
    setCursor(given.index);
    setNote('Filled one cell in.');
  }, [play]);

  const commands = useLatest({
    newPuzzle: (difficulty: Difficulty) => void newPuzzle(difficulty),
    check: runCheck,
    hint: runHint,
    close,
    undo: () => apply(undo),
    redo: () => apply(redo),
    clearCell: () => erase(cursor),
    togglePencil: () => setPrefs({ pencil: !prefs.pencil }),
    toggleHighlight: () => setPrefs({ highlight: !prefs.highlight }),
    toggleTimer: () => setPrefs({ timer: !prefs.timer }),
  });

  useAppMenus(
    buildSudokuMenus(
      {
        canUndo: play !== null && canUndo(play),
        canRedo: play !== null && canRedo(play),
        canClear: play !== null && isEditable(play, cursor),
        canHint: play !== null && hintTarget(play) !== null,
        difficulty: prefs.difficulty,
        pencil: prefs.pencil,
        highlight: prefs.highlight,
        timer: prefs.timer,
      },
      {
        newPuzzle: (difficulty) => commands.current.newPuzzle(difficulty),
        check: () => commands.current.check(),
        hint: () => commands.current.hint(),
        close: () => commands.current.close(),
        undo: () => commands.current.undo(),
        redo: () => commands.current.redo(),
        clearCell: () => commands.current.clearCell(),
        togglePencil: () => commands.current.togglePencil(),
        toggleHighlight: () => commands.current.toggleHighlight(),
        toggleTimer: () => commands.current.toggleTimer(),
      },
    ),
    [play, cursor, prefs, commands],
  );

  // ── the window ─────────────────────────────────────────────────────────

  const beside = padBeside(width);
  const conflicts = useMemo(() => (play ? conflictsOfPlay(play) : []), [play]);
  const left = useCallback((digit: number) => (play ? 9 - placed(play, digit) : 9), [play]);
  // The field is measured through a wrapper the board cannot grow: a board
  // measured inside its own scroll container would resize whenever a
  // scrollbar appeared, and then again when it went away.
  const cell = fitCell({ width: area.width - 8, height: area.height - 8 });

  return (
    <div ref={frame} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense windowControls>
            {/* The window has no title bar of its own, so this row names it. */}
            <span className="truncate-1 mr-1 min-w-0 text-base font-medium text-ink">Sudoku</span>
            <Button size="sm" variant="secondary" onClick={() => void newPuzzle(prefs.difficulty)}>
              New puzzle
            </Button>
            {width >= SELECT_FROM && (
              <Select
                size="sm"
                aria-label="Difficulty"
                value={prefs.difficulty}
                options={DIFFICULTIES.map((id) => ({ value: id, label: DIFFICULTY_LABEL[id] }))}
                onChange={(value) => void newPuzzle(value)}
              />
            )}
            <ToolbarSpacer />
            {(width === 0 || width >= HISTORY_FROM) && (
              <>
                <IconButton
                  label="Undo"
                  disabled={!play || !canUndo(play)}
                  onClick={() => commands.current.undo()}
                >
                  <Undo2 />
                </IconButton>
                <IconButton
                  label="Redo"
                  disabled={!play || !canRedo(play)}
                  onClick={() => commands.current.redo()}
                >
                  <Redo2 />
                </IconButton>
              </>
            )}
            <IconButton
              label="Pencil marks"
              active={prefs.pencil}
              onClick={() => commands.current.togglePencil()}
            >
              <Pencil />
            </IconButton>
            <IconButton
              label="Hint"
              disabled={!play || hintTarget(play) === null}
              onClick={() => commands.current.hint()}
            >
              <Lightbulb />
            </IconButton>
            <IconButton label="Check" disabled={!play} onClick={() => commands.current.check()}>
              <CheckCheck />
            </IconButton>
          </Toolbar>
        }
        statusBar={
          <>
            <span>{play ? progressLine(play, finished) : 'Dealing a puzzle'}</span>
            <span role="status" aria-live="polite" className="truncate-1 text-ink-3">
              {note ?? ''}
            </span>
            {prefs.timer && (
              <span className="ml-auto tabular-nums text-ink-2">{formatClock(elapsed)}</span>
            )}
          </>
        }
      >
        <div
          className={
            beside ? 'flex min-h-0 flex-1 gap-3 p-3' : 'flex min-h-0 flex-1 flex-col gap-2 p-2'
          }
        >
          <div ref={field} className="relative min-h-0 min-w-0 flex-1">
            {/* Centred with auto margins rather than justify-content: when the
                board is bigger than the space, auto margins collapse to zero
                and it scrolls from its top-left instead of being clipped. */}
            <div className="lumen-scroll absolute inset-0 flex p-1">
              {play && (
                <div className="m-auto">
                  <SudokuBoard
                    state={play}
                    cursor={cursor}
                    cell={cell}
                    highlight={prefs.highlight}
                    conflicts={conflicts}
                    onCursor={setCursor}
                    onDigit={write}
                    onClear={erase}
                  />
                </div>
              )}
            </div>
          </div>
          <div className={beside ? 'w-40 shrink-0' : 'shrink-0'}>
            <NumberPad
              layout={beside ? 'block' : 'row'}
              pencil={prefs.pencil}
              left={left}
              counts={beside || width >= COUNTS_FROM}
              disabled={!play || finished}
              onDigit={(digit) => write(cursor, digit)}
              onErase={() => erase(cursor)}
            />
          </div>
        </div>
      </AppFrame>
    </div>
  );
}

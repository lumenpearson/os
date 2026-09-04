import { useClipboardStore } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { IconButton, SegmentedControl, Toolbar, ToolbarSpacer } from '@lumen/ui';
import { join } from '@lumen/vfs';
import { ScrollText } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type AppProps, useAppMenus, useJsonFile } from '../_sdk';
import { Bases } from './Bases';
import { BASE_PREFIX, BASES, type Base, isDigitOfBase, parseBase, type WordSize } from './bases';
import { Display } from './Display';
import { type AngleUnit, canonicalizeInput, evaluate } from './expression';
import { formatNumber, parseNumberText } from './format';
import {
  clearLabel,
  deleteBackwards,
  type Edit,
  insertText,
  reciprocal,
  type Selection,
  textForPaste,
  toggleSign,
} from './input';
import { type KeyOverride, Keypad } from './Keypad';
import { type KeyDef, LAYOUTS, resolveKey, type TrigName, trigKey } from './keys';
import { buildCalculatorMenus } from './menus';
import {
  currentValue,
  displayText,
  INITIAL_PROGRAMMER,
  type ProgrammerAction,
  type ProgrammerState,
  reduceProgrammer,
} from './programmer';
import {
  type CalculatorData,
  DEFAULT_DATA,
  MODE_LABEL,
  MODES,
  type Mode,
  normalizeData,
  pushTape,
  type TapeEntry,
} from './storage';
import { Tape } from './Tape';

/** How long a button stays lit after the keystroke that pressed it. */
const FLASH_MS = 140;

const TRIG: Record<string, TrigName> = { sin: 'sin', cos: 'cos', tan: 'tan' };

const MODE_OPTIONS = MODES.map((mode) => ({ value: mode, label: MODE_LABEL[mode] }));

/** Read a tape result back into a number, whichever base wrote it. */
function tapeValue(result: string): bigint | null {
  for (const base of BASES) {
    const prefix = BASE_PREFIX[base];
    if (prefix && result.startsWith(prefix)) return parseBase(result.slice(prefix.length), base);
  }
  return parseBase(result, 'dec');
}

export default function Calculator(_props: AppProps) {
  const kernel = useKernel();
  const [stored, store] = useJsonFile<CalculatorData>(
    join(kernel.home, '.config', 'calculator.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const { mode, angle, base, wordSize, showTape, memory, tape } = data;

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prog, setProg] = useState<ProgrammerState>(INITIAL_PROGRAMMER);
  const [trigState, setTrigState] = useState({ second: false, hyperbolic: false });
  const [flash, setFlash] = useState<string | null>(null);

  const field = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layout = LAYOUTS[mode];
  const context = useMemo(() => ({ base, wordSize }), [base, wordSize]);
  const programmer = mode === 'programmer';

  const patch = (change: Partial<CalculatorData>) =>
    store((previous) => ({ ...normalizeData(previous), ...change }));

  // ── the expression line ─────────────────────────────────────────────────

  const evaluation = useMemo(
    () => (text.trim() === '' ? null : evaluate(text, { angle })),
    [text, angle],
  );
  const result = evaluation?.ok ? formatNumber(evaluation.value) : null;

  // React rewrites the whole value, which parks the caret at the end; put it back.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const input = field.current;
    if (caret === null || !input) return;
    pendingCaret.current = null;
    input.setSelectionRange(caret, caret);
  });

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => () => (flashTimer.current ? clearTimeout(flashTimer.current) : undefined), []);

  const selection = (): Selection => {
    const input = field.current;
    if (!input || document.activeElement !== input) return { start: text.length, end: text.length };
    return { start: input.selectionStart ?? text.length, end: input.selectionEnd ?? text.length };
  };

  const applyEdit = (edit: Edit) => {
    setText(edit.text);
    setError(null);
    pendingCaret.current = edit.caret;
    field.current?.focus();
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const next = canonicalizeInput(input.value);
    if (next !== input.value) pendingCaret.current = input.selectionStart ?? next.length;
    setText(next);
    setError(null);
  };

  const record = (entry: TapeEntry) => patch({ tape: pushTape(tape, entry) });

  const commit = () => {
    const outcome = evaluate(text, { angle });
    if (!outcome.ok) {
      if (outcome.error.code !== 'empty') setError(outcome.error.message);
      return;
    }
    const shown = formatNumber(outcome.value);
    record({ expression: text.trim(), result: shown, at: Date.now() });
    applyEdit({ text: shown, caret: shown.length });
  };

  // ── programmer mode ─────────────────────────────────────────────────────

  const dispatch = (action: ProgrammerAction) => {
    const outcome = reduceProgrammer(prog, action, context);
    setProg(outcome.state);
    if (outcome.tape) record(outcome.tape);
    field.current?.focus();
  };

  const setBase = (next: Base) => {
    setProg(
      reduceProgrammer(prog, { type: 'rebase', from: base }, { ...context, base: next }).state,
    );
    patch({ base: next });
  };

  const setWordSize = (next: WordSize) => {
    setProg(
      reduceProgrammer(prog, { type: 'resize', from: wordSize }, { ...context, wordSize: next })
        .state,
    );
    patch({ wordSize: next });
  };

  // ── memory ──────────────────────────────────────────────────────────────

  /** The number the display is showing, whichever mode is up. */
  const shownNumber = (): number | null => {
    if (programmer) return Number(currentValue(prog, context));
    return evaluation?.ok ? evaluation.value : null;
  };

  const memoryKey = (action: KeyDef['action']) => {
    if (action === 'memory-clear') return patch({ memory: 0 });
    if (action === 'memory-recall') {
      if (programmer) return dispatch({ type: 'value', value: BigInt(Math.trunc(memory)) });
      return applyEdit(insertText(text, selection(), formatNumber(memory)));
    }
    const value = shownNumber();
    if (value === null) return;
    patch({ memory: action === 'memory-add' ? memory + value : memory - value });
  };

  // ── keys ────────────────────────────────────────────────────────────────

  const flashKey = (id: string) => {
    setFlash(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const clear = () => {
    if (programmer) return dispatch({ type: 'clear' });
    setText('');
    setError(null);
    field.current?.focus();
  };

  const press = (key: KeyDef) => {
    flashKey(key.id);
    if (key.action?.startsWith('memory-')) return memoryKey(key.action);
    if (programmer) {
      if (key.insert) return dispatch({ type: 'digit', digit: key.insert });
      switch (key.action) {
        case 'operator':
          return key.operator ? dispatch({ type: 'operator', operator: key.operator }) : undefined;
        case 'not':
          return dispatch({ type: 'not' });
        case 'sign':
          return dispatch({ type: 'negate' });
        case 'equals':
          return dispatch({ type: 'equals' });
        case 'backspace':
          return dispatch({ type: 'backspace' });
        case 'clear':
          return clear();
        default:
          return;
      }
    }
    if (key.insert) {
      const trig = TRIG[key.id];
      return applyEdit(
        insertText(text, selection(), trig ? trigKey(trig, trigState).insert : key.insert),
      );
    }
    switch (key.action) {
      case 'equals':
        return commit();
      case 'clear':
        return clear();
      case 'backspace':
        return applyEdit(deleteBackwards(text, selection()));
      case 'sign':
        return applyEdit(toggleSign(text));
      case 'reciprocal':
        return applyEdit(reciprocal(text));
      case 'second':
        return setTrigState((state) => ({ ...state, second: !state.second }));
      case 'hyperbolic':
        return setTrigState((state) => ({ ...state, hyperbolic: !state.hyperbolic }));
      case 'angle':
        return patch({ angle: angle === 'deg' ? 'rad' : 'deg' });
      default:
        return;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const onButton = target instanceof HTMLElement && target.closest('button') !== null;
    // Enter and Space belong to whichever button has focus.
    if (onButton && (event.key === 'Enter' || event.key === ' ')) return;
    const outcome = resolveKey(layout, event);
    if (!outcome) return;
    if (outcome.kind === 'flash' && target === field.current) {
      flashKey(outcome.key.id);
      return;
    }
    event.preventDefault();
    press(outcome.key);
  };

  const override = (key: KeyDef): KeyOverride => {
    if (key.action?.startsWith('memory-'))
      return {
        disabled: memory === 0 && key.action !== 'memory-add' && key.action !== 'memory-subtract',
      };
    if (key.id === 'clear')
      return { label: programmer ? (prog.entry === '' ? 'AC' : 'C') : clearLabel(text) };
    if (key.id === 'angle')
      return { label: angle.toUpperCase(), name: angle === 'deg' ? 'Degrees' : 'Radians' };
    if (key.id === 'second') return { active: trigState.second };
    if (key.id === 'hyperbolic') return { active: trigState.hyperbolic };
    const trig = TRIG[key.id];
    if (trig) return { label: trigKey(trig, trigState).label };
    if (programmer && key.insert) return { disabled: !isDigitOfBase(key.insert, base) };
    return {};
  };

  // ── the tape ────────────────────────────────────────────────────────────

  const reuse = (entry: TapeEntry) => {
    if (programmer) {
      const value = tapeValue(entry.result);
      if (value !== null) dispatch({ type: 'value', value });
      return;
    }
    const number = parseNumberText(entry.result);
    const insert = number !== null ? String(number) : (tapeValue(entry.result)?.toString() ?? null);
    if (insert !== null) applyEdit(insertText(text, selection(), insert));
  };

  // ── menus ───────────────────────────────────────────────────────────────

  const shown = programmer ? displayText(prog, context) : text;

  const copy = (value: string) => {
    if (value !== '') useClipboardStore.getState().copyText(value);
  };

  const paste = async () => {
    let raw = useClipboardStore.getState().item?.text ?? '';
    try {
      raw = (await navigator.clipboard.readText()) || raw;
    } catch {
      // The host clipboard is not readable; the OS clipboard still is.
    }
    if (programmer) return dispatch({ type: 'entry', text: raw });
    const value = textForPaste(raw);
    if (value !== null) applyEdit(insertText(text, selection(), value));
  };

  useAppMenus(
    buildCalculatorMenus(
      { mode, angle, showTape, hasTape: tape.length > 0 },
      {
        copy: () => copy(shown),
        copyResult: () => copy(programmer ? shown : (result ?? '')),
        paste: () => void paste(),
        clear,
        clearTape: () => patch({ tape: [] }),
        setMode: (next: Mode) => patch({ mode: next }),
        setAngle: (next: AngleUnit) => patch({ angle: next }),
        toggleTape: () => patch({ showTape: !showTape }),
      },
    ),
    [mode, angle, base, wordSize, showTape, tape, text, prog, result, memory],
  );

  // ── render ──────────────────────────────────────────────────────────────

  const marks = [...(memory === 0 ? [] : ['M']), ...(programmer ? [] : [angle.toUpperCase()])];

  return (
    // The keyboard is the first input path: keystrokes are routed to the keys
    // from here, so they work wherever focus sits inside the window.
    <div
      className="flex h-full w-full flex-col bg-surface text-ink"
      onKeyDown={onKeyDown}
      role="application"
      aria-label="Calculator"
    >
      <Toolbar dense>
        <SegmentedControl
          size="sm"
          aria-label="Mode"
          className="min-w-0"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(next) => patch({ mode: next })}
        />
        <ToolbarSpacer />
        <IconButton
          label="Show tape"
          size="sm"
          active={showTape}
          onClick={() => patch({ showTape: !showTape })}
        >
          <ScrollText />
        </IconButton>
      </Toolbar>

      <Display
        value={shown}
        label={programmer ? 'Value' : 'Expression'}
        hint={programmer ? prog.pending : result === null ? undefined : `= ${result}`}
        error={programmer ? prog.error : error}
        marks={marks}
        readOnly={programmer}
        inputRef={field}
        onChange={onChange}
      />

      {programmer && (
        <Bases
          value={currentValue(prog, context)}
          base={base}
          wordSize={wordSize}
          onSelectBase={setBase}
          onSelectWordSize={setWordSize}
        />
      )}

      {showTape && <Tape entries={tape} onUse={reuse} onClear={() => patch({ tape: [] })} />}

      <Keypad layout={layout} onPress={press} flash={flash} override={override} />
    </div>
  );
}

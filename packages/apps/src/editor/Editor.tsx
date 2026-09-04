import { useClipboardStore } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  EmptyState,
  Spinner,
  SplitPane,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { basename, dirname, extname, join, typeInfo } from '@lumen/vfs';
import { FileWarning, Lock } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useFilePicker,
  useJsonFile,
  useLauncher,
  useNotify,
  useTextDocument,
  useWindowControls,
} from '../_sdk';
import {
  COALESCE_MS,
  canRedo,
  canUndo,
  createHistory,
  DEFAULT_FONT_SIZE,
  DEFAULT_PREFS,
  detectLineEnding,
  type EditorPrefs,
  type EditResult,
  type FindMatch,
  findMatches,
  findQueryError,
  type History,
  insertTab,
  isLargeText,
  lineColumnAt,
  lineCount,
  lineEndAt,
  lineHeightFor,
  lineIndexAt,
  newlineWithIndent,
  nextMatchFrom,
  normalizePrefs,
  offsetForLine,
  outdentLines,
  parseGoToLine,
  recordSnapshot,
  redoHistory,
  replaceAllMatches,
  replaceMatch,
  replaceRange,
  type Snapshot,
  scrollTopToReveal,
  stepMatch,
  type TextSelection,
  undoHistory,
  wordCount,
} from './editing';
import { EMPTY_FIND, FindBar, type FindState } from './FindBar';
import { MarkdownPreview } from './MarkdownPreview';
import { buildEditorMenus, type EditorActions } from './menus';
import { StatusBar } from './StatusBar';
import { TEXT_PAD_Y, TextPane } from './TextPane';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
/** Below this width the status bar keeps only the caret reading. */
const NARROW_WIDTH = 560;
const ZOOM_STEP = 1;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Editor(props: AppProps) {
  const args = useArgs(props.args);
  const kernel = useKernel();
  const dialogs = useDialogs();
  const pick = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const { close } = useWindowControls();

  const doc = useTextDocument(typeof args.path === 'string' ? args.path : null, 'Untitled');
  const [stored, storePrefs] = useJsonFile<EditorPrefs>(
    join(kernel.home, '.config', 'editor.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalizePrefs(stored), [stored]);

  const [caret, setCaret] = useState<TextSelection>({ start: 0, end: 0 });
  const [find, setFind] = useState<FindState>(EMPTY_FIND);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [preview, setPreview] = useState(false);
  const [undoable, setUndoable] = useState({ undo: false, redo: false });

  const textarea = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<TextSelection | null>(null);
  const history = useRef<History>(createHistory({ text: '', selection: { start: 0, end: 0 } }));
  const scrollFrame = useRef(0);
  const releaseTab = useRef(false);

  const readOnly = isLargeText(doc.text);
  const isMarkdown = MARKDOWN_EXTENSIONS.includes(extname(doc.path ?? ''));
  const latest = useLatest({ doc, text: doc.text, caret, prefs, readOnly });

  const [frame, size] = useElementSize<HTMLDivElement>();
  const narrow = size.width > 0 && size.width < NARROW_WIDTH;

  // ── history ─────────────────────────────────────────────────────────────

  const syncUndoable = useCallback(() => {
    const undo = canUndo(history.current);
    const redo = canRedo(history.current);
    setUndoable((prev) => (prev.undo === undo && prev.redo === redo ? prev : { undo, redo }));
  }, []);

  // A different document means a different history; the text of the one being
  // edited is deliberately not a dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets when a document finishes loading, not on every keystroke
  useEffect(() => {
    if (doc.loading) return;
    history.current = createHistory({ text: doc.text, selection: { start: 0, end: 0 } });
    syncUndoable();
  }, [doc.path, doc.loading, syncUndoable]);

  const applyEdit = useCallback(
    (result: EditResult, options: { merge?: boolean } = {}) => {
      pendingSelection.current = result.selection;
      latest.current.doc.setText(result.text);
      setCaret(result.selection);
      history.current = recordSnapshot(
        history.current,
        { text: result.text, selection: result.selection },
        Date.now(),
        { coalesceMs: options.merge ? COALESCE_MS : 0 },
      );
      syncUndoable();
    },
    [latest, syncUndoable],
  );

  const restore = useCallback(
    (snapshot: Snapshot) => {
      pendingSelection.current = snapshot.selection;
      latest.current.doc.setText(snapshot.text);
      setCaret(snapshot.selection);
      textarea.current?.focus();
      syncUndoable();
    },
    [latest, syncUndoable],
  );

  const undo = useCallback(() => {
    const result = undoHistory(history.current);
    history.current = result.history;
    if (result.snapshot) restore(result.snapshot);
  }, [restore]);

  const redo = useCallback(() => {
    const result = redoHistory(history.current);
    history.current = result.history;
    if (result.snapshot) restore(result.snapshot);
  }, [restore]);

  // The caret has to be put back by hand: React writes the whole value.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const area = textarea.current;
    if (!selection || !area) return;
    pendingSelection.current = null;
    area.setSelectionRange(selection.start, selection.end);
  });

  // ── caret and scrolling ─────────────────────────────────────────────────

  const readCaret = useCallback(() => {
    const area = textarea.current;
    if (!area) return;
    setCaret((prev) =>
      prev.start === area.selectionStart && prev.end === area.selectionEnd
        ? prev
        : { start: area.selectionStart, end: area.selectionEnd },
    );
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      if (document.activeElement === textarea.current) readCaret();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [readCaret]);

  const syncScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const area = textarea.current;
      const column = gutter.current;
      if (area && column) column.scrollTop = area.scrollTop;
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  const revealOffset = useCallback(
    (offset: number) => {
      const area = textarea.current;
      if (!area) return;
      const line = lineIndexAt(latest.current.text, offset);
      const row = rows.current?.children.item(line);
      const height = lineHeightFor(latest.current.prefs.fontSize);
      const top = row instanceof HTMLElement ? row.offsetTop : TEXT_PAD_Y + line * height;
      const block = row instanceof HTMLElement ? row.offsetHeight : height;
      area.scrollTop = scrollTopToReveal(top, block, area.clientHeight, area.scrollTop);
      syncScroll();
    },
    [latest, syncScroll],
  );

  // ── typing ──────────────────────────────────────────────────────────────

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const area = event.currentTarget;
      applyEdit(
        { text: area.value, selection: { start: area.selectionStart, end: area.selectionEnd } },
        { merge: true },
      );
    },
    [applyEdit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const area = event.currentTarget;
      const selection = { start: area.selectionStart, end: area.selectionEnd };
      const text = area.value;

      if (event.key === 'Escape') {
        if (find.open) {
          event.preventDefault();
          setFind((state) => ({ ...state, open: false }));
          return;
        }
        // Tab types an indent here, so Escape first releases it for focus.
        releaseTab.current = true;
        return;
      }
      if (event.key !== 'Tab') releaseTab.current = false;
      if (latest.current.readOnly || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === 'Tab') {
        if (releaseTab.current) return;
        event.preventDefault();
        applyEdit(event.shiftKey ? outdentLines(text, selection) : insertTab(text, selection));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        applyEdit(newlineWithIndent(text, selection));
      }
    },
    [applyEdit, find.open, latest],
  );

  // ── find and replace ────────────────────────────────────────────────────

  const findOptions = useMemo(
    () => ({ caseSensitive: find.caseSensitive, regex: find.regex }),
    [find.caseSensitive, find.regex],
  );
  const matches = useMemo(
    () => (find.open && find.query ? findMatches(doc.text, find.query, findOptions) : []),
    [find.open, find.query, findOptions, doc.text],
  );
  const findError = useMemo(
    () => findQueryError(find.query, findOptions),
    [find.query, findOptions],
  );

  const selectMatch = useCallback(
    (index: number, list: readonly FindMatch[]) => {
      const match = list[index];
      const area = textarea.current;
      if (!match || !area) return;
      area.setSelectionRange(match.start, match.end);
      setCaret({ start: match.start, end: match.end });
      revealOffset(match.start);
    },
    [revealOffset],
  );

  // Incremental search: while the query is being typed the first match after
  // the caret is selected. Edits made in the text leave the selection alone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caret is read once per change of the match set
  useEffect(() => {
    if (!find.open || matches.length === 0) {
      setMatchIndex(-1);
      return;
    }
    if (document.activeElement === findInput.current) {
      const index = nextMatchFrom(matches, latest.current.caret.start, true);
      setMatchIndex(index);
      selectMatch(index, matches);
      return;
    }
    setMatchIndex((current) => Math.min(current, matches.length - 1));
  }, [matches, find.open, selectMatch]);

  const navigate = (forward: boolean) => {
    if (matches.length === 0) return;
    const index =
      matchIndex < 0
        ? nextMatchFrom(matches, caret.start, forward)
        : stepMatch(matches.length, matchIndex, forward);
    setMatchIndex(index);
    selectMatch(index, matches);
  };

  const patchFind = (patch: Partial<FindState>) => {
    setFind((state) => ({ ...state, ...patch }));
    if ('query' in patch || 'caseSensitive' in patch || 'regex' in patch) setMatchIndex(-1);
  };

  const openFind = useCallback((withReplace: boolean) => {
    const area = textarea.current;
    const selected = area ? area.value.slice(area.selectionStart, area.selectionEnd) : '';
    const seed = selected && !selected.includes('\n') && selected.length <= 200 ? selected : null;
    setFind((state) => ({
      ...state,
      open: true,
      replace: withReplace || state.replace,
      query: seed ?? state.query,
    }));
    if (seed !== null) setMatchIndex(-1);
    requestAnimationFrame(() => findInput.current?.select());
  }, []);

  const closeFind = useCallback(() => {
    setFind((state) => ({ ...state, open: false }));
    textarea.current?.focus();
  }, []);

  const replaceCurrent = () => {
    const match = matches[matchIndex] ?? matches[0];
    if (!match || readOnly) return;
    applyEdit(replaceMatch(doc.text, match, find.replacement, findOptions));
  };

  const replaceEvery = () => {
    if (readOnly) return;
    const result = replaceAllMatches(doc.text, find.query, find.replacement, findOptions);
    if (result.count === 0) return;
    const at = Math.min(caret.start, result.text.length);
    applyEdit({ text: result.text, selection: { start: at, end: at } });
  };

  // ── file commands ───────────────────────────────────────────────────────

  const saveAs = useCallback(async () => {
    const current = latest.current.doc;
    const chosen = await pick({
      mode: 'save',
      title: 'Save As',
      defaultName: current.path ? basename(current.path) : 'Untitled.txt',
      startDir: current.path ? dirname(current.path) : undefined,
    });
    const path = typeof chosen === 'string' ? chosen : null;
    if (!path) return false;
    try {
      await latest.current.doc.saveAs(path);
      kernel.addRecent(path, 'lumen.editor');
      return true;
    } catch (error) {
      notify('Could not save', describe(error));
      return false;
    }
  }, [pick, kernel, notify, latest]);

  const save = useCallback(async () => {
    const current = latest.current.doc;
    if (latest.current.readOnly) return false;
    if (!current.path) return saveAs();
    try {
      await current.save();
      kernel.addRecent(current.path, 'lumen.editor');
      return true;
    } catch (error) {
      notify('Could not save', describe(error));
      return false;
    }
  }, [saveAs, kernel, notify, latest]);

  const confirmDiscard = useCallback(async () => {
    const current = latest.current.doc;
    if (!current.dirty) return true;
    const answer = await dialogs.choose({
      title: `Save changes to ${current.path ? basename(current.path) : 'Untitled'}?`,
      message: 'If you do not save, the changes are lost.',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'discard', label: "Don't Save", variant: 'secondary' },
        { id: 'save', label: 'Save' },
      ],
    });
    if (answer === 'save') return save();
    return answer === 'discard';
  }, [dialogs, save, latest]);

  useCloseGuard(doc.dirty ? confirmDiscard : null);

  const openFile = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await pick({ mode: 'open', title: 'Open' });
    const path = typeof chosen === 'string' ? chosen : (chosen?.[0] ?? null);
    if (!path) return;
    setFind(EMPTY_FIND);
    setCaret({ start: 0, end: 0 });
    await latest.current.doc.load(path);
  }, [confirmDiscard, pick, latest]);

  const goToLine = useCallback(async () => {
    const text = latest.current.text;
    const total = lineCount(text);
    const answer = await dialogs.prompt({
      title: 'Go to Line',
      message: `Line 1 to ${total}.`,
      placeholder: '1',
      mono: true,
      confirmLabel: 'Go',
      validate: (value) => (parseGoToLine(value, total) ? null : 'Enter a line number'),
    });
    if (answer === null) return;
    const target = parseGoToLine(answer, total);
    if (!target) return;
    const start = offsetForLine(text, target.line);
    const offset = Math.min(start + target.column - 1, lineEndAt(text, start));
    const area = textarea.current;
    area?.focus();
    area?.setSelectionRange(offset, offset);
    setCaret({ start: offset, end: offset });
    revealOffset(offset);
  }, [dialogs, latest, revealOffset]);

  // ── clipboard ───────────────────────────────────────────────────────────

  const copy = useCallback(() => {
    const area = textarea.current;
    if (!area) return '';
    const value = area.value.slice(area.selectionStart, area.selectionEnd);
    if (value) useClipboardStore.getState().copyText(value);
    return value;
  }, []);

  const cut = useCallback(() => {
    const area = textarea.current;
    if (!area || latest.current.readOnly || !copy()) return;
    applyEdit(replaceRange(area.value, { start: area.selectionStart, end: area.selectionEnd }, ''));
    area.focus();
  }, [applyEdit, copy, latest]);

  const paste = useCallback(async () => {
    const area = textarea.current;
    if (!area || latest.current.readOnly) return;
    let value = '';
    try {
      value = await navigator.clipboard.readText();
    } catch {
      value = useClipboardStore.getState().item?.text ?? '';
    }
    if (!value) return;
    applyEdit(
      replaceRange(area.value, { start: area.selectionStart, end: area.selectionEnd }, value),
    );
    area.focus();
  }, [applyEdit, latest]);

  const selectAll = useCallback(() => {
    const area = textarea.current;
    if (!area) return;
    area.focus();
    area.select();
    setCaret({ start: 0, end: area.value.length });
  }, []);

  // ── view commands ───────────────────────────────────────────────────────

  const zoom = useCallback(
    (delta: number) => {
      storePrefs((current) => {
        const value = normalizePrefs(current);
        return { ...value, fontSize: value.fontSize + delta };
      });
    },
    [storePrefs],
  );

  const setPref = useCallback(
    <K extends keyof EditorPrefs>(key: K, value: (current: EditorPrefs) => EditorPrefs[K]) => {
      storePrefs((current) => {
        const settings = normalizePrefs(current);
        return { ...settings, [key]: value(settings) };
      });
    },
    [storePrefs],
  );

  useEffect(() => {
    if (!isMarkdown) setPreview(false);
  }, [isMarkdown]);

  const actions = useMemo<EditorActions>(
    () => ({
      newWindow: () => launch('lumen.editor', {}),
      open: () => void openFile(),
      save: () => void save(),
      saveAs: () => void saveAs(),
      close: () => void close(),
      undo,
      redo,
      cut,
      copy: () => void copy(),
      paste: () => void paste(),
      selectAll,
      find: () => openFind(false),
      replace: () => openFind(true),
      goToLine: () => void goToLine(),
      toggleWordWrap: () => setPref('wordWrap', (p) => !p.wordWrap),
      toggleLineNumbers: () => setPref('lineNumbers', (p) => !p.lineNumbers),
      togglePreview: () => setPreview((on) => !on),
      zoomIn: () => zoom(ZOOM_STEP),
      zoomOut: () => zoom(-ZOOM_STEP),
      zoomReset: () => setPref('fontSize', () => DEFAULT_FONT_SIZE),
      help: () => launch('lumen.help', { section: 'editor' }),
    }),
    [
      launch,
      openFile,
      save,
      saveAs,
      close,
      undo,
      redo,
      cut,
      copy,
      paste,
      selectAll,
      openFind,
      goToLine,
      setPref,
      zoom,
    ],
  );

  const menuState = {
    hasPath: doc.path !== null,
    readOnly,
    canUndo: undoable.undo,
    canRedo: undoable.redo,
    hasSelection: caret.end > caret.start,
    wordWrap: prefs.wordWrap,
    lineNumbers: prefs.lineNumbers,
    preview,
    isMarkdown,
  };

  useAppMenus(buildEditorMenus(menuState, actions), [
    actions,
    menuState.hasPath,
    menuState.readOnly,
    menuState.canUndo,
    menuState.canRedo,
    menuState.hasSelection,
    menuState.wordWrap,
    menuState.lineNumbers,
    menuState.preview,
    menuState.isMarkdown,
  ]);

  // ── render ──────────────────────────────────────────────────────────────

  const position = lineColumnAt(doc.text, caret.start);
  const pane = (
    <TextPane
      text={doc.text}
      fontSize={prefs.fontSize}
      wordWrap={prefs.wordWrap}
      lineNumbers={prefs.lineNumbers}
      readOnly={readOnly}
      currentLine={position.line - 1}
      textareaRef={textarea}
      gutterRef={gutter}
      rowsRef={rows}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onSelectionChange={readCaret}
      onScroll={syncScroll}
    />
  );

  const vertical = narrow;
  const span = vertical ? size.height : size.width;

  return (
    <AppFrame
      toolbar={
        find.open ? (
          <FindBar
            state={find}
            matchCount={matches.length}
            activeIndex={matchIndex}
            error={findError}
            readOnly={readOnly}
            inputRef={findInput}
            onPatch={patchFind}
            onNavigate={navigate}
            onReplace={replaceCurrent}
            onReplaceAll={replaceEvery}
            onClose={closeFind}
          />
        ) : undefined
      }
      statusBar={
        <StatusBar
          line={position.line}
          column={position.column}
          selectionLength={caret.end - caret.start}
          words={wordCount(doc.text)}
          characters={doc.text.length}
          lineEnding={detectLineEnding(doc.text)}
          typeLabel={doc.path ? typeInfo(doc.path).label : 'Plain Text'}
          readOnly={readOnly}
          narrow={narrow}
          markdown={isMarkdown}
          preview={preview}
          onTogglePreview={() => setPreview((on) => !on)}
        />
      }
    >
      <div ref={frame} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {readOnly && (
          <div className="flex shrink-0 items-center gap-2 border-b border-rule bg-canvas px-3 py-1.5 text-sm text-ink-2">
            <Lock className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span>This file is larger than 2 MB, so it is open read-only.</span>
          </div>
        )}
        {doc.loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : doc.error ? (
          <EmptyState
            icon={<FileWarning />}
            title="Could not open this file"
            description={doc.error}
            action={
              <Button variant="primary" onClick={() => void openFile()}>
                Open another file
              </Button>
            }
          />
        ) : preview ? (
          <SplitPane
            direction={vertical ? 'vertical' : 'horizontal'}
            first={pane}
            second={<MarkdownPreview source={doc.text} />}
            initial={Math.max(160, Math.round(span / 2))}
            min={Math.max(120, Math.round(span * 0.2))}
            max={Math.max(200, Math.round(span * 0.8))}
            storageKey={`editor-preview-${vertical ? 'v' : 'h'}`}
          />
        ) : (
          pane
        )}
      </div>
    </AppFrame>
  );
}

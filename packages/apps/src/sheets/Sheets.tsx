import { useClipboardStore } from '@lumen/kernel';
import { useKernel, useSettings, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  cx,
  Divider,
  IconButton,
  Input,
  Select,
  Toolbar,
  ToolbarGroup,
  useDialogs,
} from '@lumen/ui';
import { basename, dirname, extname, join } from '@lumen/vfs';
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useDirty,
  useFilePicker,
  useLauncher,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { evaluateSheet } from './engine/evaluate';
import { type Align, currencyForLocale, NUMBER_FORMATS, type NumberFormat } from './engine/format';
import {
  type Coord,
  coordKey,
  formatRange,
  normalizeRange,
  parseRefOrRange,
  type RangeRef,
  rangeOf,
} from './engine/refs';
import { FunctionsDialog } from './FunctionsDialog';
import { type EditorState, Grid, type Selection } from './Grid';
import { buildMenus } from './menus';
import {
  acceptsReference,
  addSheet,
  blockToTsv,
  type CellStyle,
  cellText,
  clearRange,
  deleteColumns,
  deleteRows,
  emptySheet,
  emptyWorkbook,
  endsWithReference,
  fillRange,
  gridSize,
  insertColumns,
  insertReference,
  insertRows,
  MAX_COLS,
  MAX_ROWS,
  parseCellInput,
  parseWorkbook,
  pushHistory,
  readRange,
  removeSheet,
  renameSheet,
  replaceSheet,
  type SheetData,
  type Snapshot,
  selectionStats,
  serializeWorkbook,
  setCell,
  setColumnWidth,
  setRowHeight,
  setStyle,
  sheetToCsv,
  styleAt,
  tsvToBlock,
  usedBounds,
  type Workbook,
  workbookFromCsv,
  writeBlock,
} from './workbook';

type DocumentKind = 'lsd' | 'csv' | 'tsv';

const ORIGIN: Coord = { col: 0, row: 0 };

function kindOf(path: string): DocumentKind {
  const ext = extname(path).toLowerCase();
  return ext === '.csv' ? 'csv' : ext === '.tsv' ? 'tsv' : 'lsd';
}

/** True while the caret sits in a text field, so Delete and Select All belong to it. */
function editingText(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

async function readClipboardText(): Promise<string> {
  try {
    const text = await navigator.clipboard?.readText();
    if (text) return text;
  } catch {
    // The browser refused; the OS clipboard below still has whatever Lumen copied.
  }
  return useClipboardStore.getState().item?.text ?? '';
}

export default function Sheets({ args: initialArgs }: AppProps) {
  const args = useArgs(initialArgs);
  const { container } = useApp();
  const vfs = useVfs();
  const kernel = useKernel();
  const dialogs = useDialogs();
  const pick = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const { setDocument, close } = useWindowControls();
  const settings = useSettings();
  const locale = settings.region.locale || 'en-US';
  const currency = useMemo(() => currencyForLocale(locale), [locale]);

  const [workbook, setWorkbook] = useState<Workbook>(emptyWorkbook);
  const [active, setActive] = useState(0);
  const [path, setPath] = useState<string | null>(null);
  const [kind, setKind] = useState<DocumentKind>('lsd');
  const [dirty, setDirtyState] = useState(false);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [selection, setSelection] = useState<Selection>({ anchor: ORIGIN, focus: ORIGIN });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [showFunctions, setShowFunctions] = useState(false);
  /** Rows and columns the user has travelled to beyond the used area. */
  const [floor, setFloor] = useState({ rows: 0, cols: 0 });
  const gridRoot = useRef<HTMLDivElement>(null);
  const buffer = useRef<{ block: Array<Array<string | number | undefined>>; origin: Coord } | null>(
    null,
  );

  const sheet = workbook.sheets[active] ?? emptySheet();
  const values = useMemo(() => evaluateSheet(sheet.cells, { locale }), [sheet.cells, locale]);
  const range = useMemo(
    () => normalizeRange(rangeOf(selection.anchor, selection.focus)),
    [selection],
  );
  const activeKey = coordKey(selection.anchor);
  const activeStyle = styleAt(sheet, activeKey);
  const stats = useMemo(() => selectionStats(values, range), [values, range]);
  const fileName = path ? basename(path) : 'Untitled';

  useTitle(`${fileName} — Sheets`);
  useDirty(dirty);
  useEffect(() => {
    setDocument(path);
  }, [path, setDocument]);

  const focusGrid = useCallback(() => {
    gridRoot.current?.querySelector<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, []);

  // ── history ─────────────────────────────────────────────────────────────

  const commit = useCallback(
    (updater: (workbook: Workbook) => Workbook) => {
      setPast((p) => pushHistory(p, { workbook, active }));
      setFuture([]);
      setWorkbook(updater(workbook));
      setDirtyState(true);
    },
    [workbook, active],
  );

  const updateSheet = useCallback(
    (updater: (sheet: SheetData) => SheetData) => {
      commit((wb) => replaceSheet(wb, active, updater(wb.sheets[active] ?? emptySheet())));
    },
    [commit, active],
  );

  const undo = useCallback(() => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture((f) => pushHistory(f, { workbook, active }));
    setPast((p) => p.slice(0, -1));
    setWorkbook(previous.workbook);
    setActive(Math.min(previous.active, previous.workbook.sheets.length - 1));
    setEditor(null);
    setDirtyState(true);
  }, [past, workbook, active]);

  const redo = useCallback(() => {
    const next = future[future.length - 1];
    if (!next) return;
    setPast((p) => pushHistory(p, { workbook, active }));
    setFuture((f) => f.slice(0, -1));
    setWorkbook(next.workbook);
    setActive(Math.min(next.active, next.workbook.sheets.length - 1));
    setEditor(null);
    setDirtyState(true);
  }, [future, workbook, active]);

  // ── files ───────────────────────────────────────────────────────────────

  const load = useCallback(
    async (target: string) => {
      try {
        const documentKind = kindOf(target);
        if (documentKind === 'lsd') {
          setWorkbook(parseWorkbook(await vfs.readJson(target)));
        } else {
          const text = await vfs.readText(target);
          setWorkbook(
            workbookFromCsv(
              text,
              basename(target, true),
              documentKind === 'tsv' ? '\t' : undefined,
            ),
          );
        }
        setKind(documentKind);
        setPath(target);
        setActive(0);
        setFloor({ rows: 0, cols: 0 });
        setSelection({ anchor: ORIGIN, focus: ORIGIN });
        setEditor(null);
        setPast([]);
        setFuture([]);
        setDirtyState(false);
        kernel.addRecent(target, 'lumen.sheets');
      } catch (e) {
        notify(
          'Could not open the file',
          `${basename(target)}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [vfs, kernel, notify],
  );

  const requestedPath = typeof args.path === 'string' ? args.path : null;
  useEffect(() => {
    if (requestedPath) void load(requestedPath);
  }, [requestedPath, load]);

  const writeTo = useCallback(
    async (target: string, documentKind: DocumentKind) => {
      try {
        if (documentKind === 'lsd') {
          await vfs.writeJson(target, serializeWorkbook(workbook), { recursive: true });
        } else {
          const text = sheetToCsv(sheet, { locale, currency }, documentKind === 'tsv' ? '\t' : ',');
          await vfs.writeText(target, text, { recursive: true });
        }
        setPath(target);
        setKind(documentKind);
        setDirtyState(false);
        kernel.addRecent(target, 'lumen.sheets');
        return true;
      } catch (e) {
        notify(
          'Could not save the file',
          `${basename(target)}: ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
      }
    },
    [vfs, kernel, notify, workbook, sheet, locale, currency],
  );

  const saveAs = useCallback(async () => {
    const suggested = `${path ? basename(path, true) : sheet.name || 'Untitled'}.lsd`;
    const target = await pick({
      mode: 'save',
      title: 'Save As',
      defaultName: suggested,
      startDir: path ? dirname(path) : join(kernel.home, 'Documents'),
      extensions: ['.lsd'],
    });
    if (typeof target !== 'string') return false;
    return writeTo(target, kindOf(target));
  }, [pick, path, sheet.name, kernel.home, writeTo]);

  const save = useCallback(async () => {
    if (!path) return saveAs();
    return writeTo(path, kind);
  }, [path, kind, saveAs, writeTo]);

  const exportCsv = useCallback(async () => {
    const stem = path ? basename(path, true) : sheet.name || 'Sheet';
    const target = await pick({
      mode: 'save',
      title: 'Export CSV',
      defaultName: `${stem}.csv`,
      startDir: path ? dirname(path) : join(kernel.home, 'Documents'),
      extensions: ['.csv'],
    });
    if (typeof target !== 'string') return;
    try {
      await vfs.writeText(
        target,
        sheetToCsv(sheet, { locale, currency }, kindOf(target) === 'tsv' ? '\t' : ','),
        {
          recursive: true,
        },
      );
      notify('Sheet exported', basename(target));
    } catch (e) {
      notify('Could not export the sheet', e instanceof Error ? e.message : String(e));
    }
  }, [pick, path, sheet, kernel.home, vfs, locale, currency, notify]);

  /** Ask before throwing away unsaved changes. */
  const confirmDiscard = useCallback(async () => {
    if (!dirty) return true;
    const choice = await dialogs.choose({
      title: `Save changes to ${fileName}?`,
      message: 'Your changes are lost if you do not save them.',
      buttons: [
        { id: 'discard', label: "Don't Save" },
        { id: 'cancel', label: 'Cancel' },
        { id: 'save', label: 'Save', variant: 'primary' },
      ],
    });
    if (choice === 'save') return save();
    return choice === 'discard';
  }, [dirty, dialogs, fileName, save]);

  useCloseGuard(dirty ? confirmDiscard : null);

  const open = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const target = await pick({
      mode: 'open',
      title: 'Open',
      extensions: ['.lsd', '.csv', '.tsv'],
      startDir: join(kernel.home, 'Documents'),
    });
    if (typeof target === 'string') await load(target);
  }, [confirmDiscard, pick, kernel.home, load]);

  // ── selection and editing ───────────────────────────────────────────────

  const size = useMemo(() => gridSize(sheet, floor), [sheet, floor]);
  /** The bottom-right of the filled area, where End and Ctrl+End land. */
  const lastUsed = useMemo(() => {
    const used = usedBounds(sheet);
    return { col: Math.max(0, used.cols - 1), row: Math.max(0, used.rows - 1) };
  }, [sheet]);

  /** Keep enough grid drawn to reach a cell the selection has travelled to. */
  const growTo = useCallback((...cells: Coord[]) => {
    const row = Math.max(...cells.map((c) => c.row)) + 2;
    const col = Math.max(...cells.map((c) => c.col)) + 2;
    setFloor((f) =>
      f.rows >= row && f.cols >= col
        ? f
        : { rows: Math.max(f.rows, row), cols: Math.max(f.cols, col) },
    );
  }, []);

  const selectRange = useCallback(
    (anchor: Coord, focus: Coord) => {
      growTo(anchor, focus);
      setSelection({ anchor, focus });
    },
    [growTo],
  );

  /** Move the selection, growing the grid when it travels past the drawn edge. */
  const moveTo = useCallback(
    (cell: Coord, extend = false) => {
      const clamped = {
        col: Math.max(0, Math.min(MAX_COLS - 1, cell.col)),
        row: Math.max(0, Math.min(MAX_ROWS - 1, cell.row)),
      };
      growTo(clamped);
      setSelection((s) => ({ anchor: extend ? s.anchor : clamped, focus: clamped }));
    },
    [growTo],
  );

  const step = useCallback(
    (move: 'down' | 'up' | 'left' | 'right' | 'none') => {
      if (move === 'none') return;
      const delta = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] }[move];
      moveTo({
        col: selection.anchor.col + (delta[1] ?? 0),
        row: selection.anchor.row + (delta[0] ?? 0),
      });
    },
    [moveTo, selection.anchor],
  );

  const commitCell = useCallback(
    (cell: Coord, text: string, move: 'down' | 'up' | 'left' | 'right' | 'none') => {
      const key = coordKey(cell);
      const { value, format } = parseCellInput(text);
      const before = sheet.cells[key];
      if (value !== (before ?? null) || format) {
        updateSheet((s) => {
          const next = setCell(s, key, value);
          return format ? setStyle(next, [key], { format }) : next;
        });
      }
      setEditor(null);
      step(move);
      focusGrid();
    },
    [sheet.cells, updateSheet, step, focusGrid],
  );

  const startEditing = useCallback((cell: Coord, text: string) => {
    setEditor({ cell, text, caret: text.length, source: 'grid' });
  }, []);

  /** A click on the grid while a formula is open puts its reference in the text. */
  const onReferencePick = useCallback(
    (picked: RangeRef) => {
      if (!editor?.text.startsWith('=')) return false;
      if (
        !acceptsReference(editor.text, editor.caret) &&
        !endsWithReference(editor.text, editor.caret)
      )
        return false;
      const { text, caret } = insertReference(editor.text, editor.caret, formatRange(picked));
      setEditor({ ...editor, text, caret });
      return true;
    },
    [editor],
  );

  const clearSelection = useCallback(() => {
    updateSheet((s) => clearRange(s, range));
  }, [updateSheet, range]);

  const styleSelection = useCallback(
    (patch: CellStyle) => {
      const keys: string[] = [];
      for (let row = range.start.row; row <= range.end.row; row++) {
        for (let col = range.start.col; col <= range.end.col; col++)
          keys.push(coordKey({ col, row }));
      }
      updateSheet((s) => setStyle(s, keys, patch));
    },
    [updateSheet, range],
  );

  const toggleBold = useCallback(
    () => styleSelection({ bold: !activeStyle?.bold }),
    [styleSelection, activeStyle],
  );
  const toggleItalic = useCallback(
    () => styleSelection({ italic: !activeStyle?.italic }),
    [styleSelection, activeStyle],
  );
  const setAlign = useCallback((align: Align) => styleSelection({ align }), [styleSelection]);
  const setFormat = useCallback(
    (format: NumberFormat) => styleSelection({ format }),
    [styleSelection],
  );

  // ── clipboard ───────────────────────────────────────────────────────────

  const copy = useCallback(() => {
    const block = readRange(sheet, range);
    buffer.current = { block, origin: range.start };
    useClipboardStore.getState().copyText(blockToTsv(block));
  }, [sheet, range]);

  const cut = useCallback(() => {
    copy();
    clearSelection();
  }, [copy, clearSelection]);

  const paste = useCallback(async () => {
    const text = await readClipboardText();
    const held = buffer.current;
    const fromBuffer = held !== null && blockToTsv(held.block) === text.replace(/\r\n/g, '\n');
    const block = fromBuffer && held ? held.block : tsvToBlock(text);
    if (block.length === 0) return;
    const target = range.start;
    updateSheet((s) => writeBlock(s, target, block, fromBuffer && held ? held.origin : undefined));
    const height = block.length - 1;
    const width = Math.max(...block.map((line) => line.length)) - 1;
    selectRange(target, {
      col: target.col + Math.max(0, width),
      row: target.row + Math.max(0, height),
    });
  }, [range.start, updateSheet, selectRange]);

  const selectAll = useCallback(() => {
    setSelection({ anchor: ORIGIN, focus: { col: size.cols - 1, row: size.rows - 1 } });
  }, [size.cols, size.rows]);

  // ── rows, columns and sheets ────────────────────────────────────────────

  const insertRowAt = useCallback(
    (at: number) => updateSheet((s) => insertRows(s, at)),
    [updateSheet],
  );
  const insertColumnAt = useCallback(
    (at: number) => updateSheet((s) => insertColumns(s, at)),
    [updateSheet],
  );

  const addNewSheet = useCallback(() => {
    commit((wb) => addSheet(wb));
    setActive(workbook.sheets.length);
    setSelection({ anchor: ORIGIN, focus: ORIGIN });
  }, [commit, workbook.sheets.length]);

  const renameSheetAt = useCallback(
    async (index: number) => {
      const current = workbook.sheets[index];
      if (!current) return;
      const name = await dialogs.prompt({
        title: 'Rename Sheet',
        defaultValue: current.name,
        confirmLabel: 'Rename',
        validate: (v) => (v.trim() ? null : 'The sheet needs a name.'),
      });
      if (name?.trim()) commit((wb) => renameSheet(wb, index, name));
    },
    [workbook.sheets, dialogs, commit],
  );

  const deleteSheetAt = useCallback(
    async (index: number) => {
      if (workbook.sheets.length <= 1) return;
      const target = workbook.sheets[index];
      if (!target) return;
      const ok = await dialogs.confirm({
        title: `Delete “${target.name}”?`,
        message: 'The sheet and everything on it go away. Undo brings it back.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      commit((wb) => removeSheet(wb, index));
      setActive((a) => Math.max(0, Math.min(a, workbook.sheets.length - 2)));
    },
    [workbook.sheets, dialogs, commit],
  );

  // ── keyboard ────────────────────────────────────────────────────────────

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    if (editor) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCell(editor.cell, editor.text, e.shiftKey ? 'up' : 'down');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitCell(editor.cell, editor.text, e.shiftKey ? 'left' : 'right');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditor(null);
        focusGrid();
      }
      return;
    }
    const { col, row } = selection.focus;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveTo({ col, row: row + 1 }, e.shiftKey);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveTo({ col, row: row - 1 }, e.shiftKey);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveTo({ col: col - 1, row }, e.shiftKey);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveTo({ col: col + 1, row }, e.shiftKey);
        return;
      case 'Tab':
        e.preventDefault();
        moveTo({ col: e.shiftKey ? col - 1 : col + 1, row });
        return;
      case 'Enter':
        e.preventDefault();
        if (mod) startEditing(selection.anchor, cellText(sheet.cells[activeKey]));
        else
          moveTo({ col: selection.anchor.col, row: selection.anchor.row + (e.shiftKey ? -1 : 1) });
        return;
      case 'F2':
        e.preventDefault();
        startEditing(selection.anchor, cellText(sheet.cells[activeKey]));
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        clearSelection();
        return;
      case 'Home':
        e.preventDefault();
        moveTo(mod ? ORIGIN : { col: 0, row }, e.shiftKey);
        return;
      case 'End':
        e.preventDefault();
        moveTo({ col: lastUsed.col, row: mod ? lastUsed.row : row }, e.shiftKey);
        return;
      case 'PageDown':
        e.preventDefault();
        moveTo({ col, row: row + 20 }, e.shiftKey);
        return;
      case 'PageUp':
        e.preventDefault();
        moveTo({ col, row: row - 20 }, e.shiftKey);
        return;
      case 'Escape':
        e.preventDefault();
        // Collapse a range first; a second Escape leaves the grid so Tab can
        // reach the sheet tabs, since Tab itself moves between cells.
        if (
          selection.anchor.col === selection.focus.col &&
          selection.anchor.row === selection.focus.row
        ) {
          (e.target as HTMLElement).blur();
        } else {
          setSelection({ anchor: selection.anchor, focus: selection.anchor });
        }
        return;
      default:
        break;
    }
    if (!mod && e.key.length === 1) {
      e.preventDefault();
      startEditing(selection.anchor, e.key);
    }
  };

  // ── menus ───────────────────────────────────────────────────────────────

  useAppMenus(
    buildMenus(
      {
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        bold: activeStyle?.bold ?? false,
        italic: activeStyle?.italic ?? false,
        align: activeStyle?.align,
        format: activeStyle?.format ?? 'general',
        canDeleteSheet: workbook.sheets.length > 1,
      },
      {
        newWindow: () => launch('lumen.sheets', {}),
        open: () => void open(),
        save: () => void save(),
        saveAs: () => void saveAs(),
        exportCsv: () => void exportCsv(),
        close: () => void close(),
        undo,
        redo,
        cut,
        copy,
        paste: () => void paste(),
        // Delete and Select All belong to whatever text field has the caret.
        clear: () => {
          if (!editingText()) clearSelection();
        },
        selectAll: () => {
          if (!editingText()) selectAll();
        },
        toggleBold,
        toggleItalic,
        setAlign,
        setFormat,
        insertRowAbove: () => insertRowAt(range.start.row),
        insertRowBelow: () => insertRowAt(range.end.row + 1),
        insertColumnLeft: () => insertColumnAt(range.start.col),
        insertColumnRight: () => insertColumnAt(range.end.col + 1),
        deleteRow: () =>
          updateSheet((s) => deleteRows(s, range.start.row, range.end.row - range.start.row + 1)),
        deleteColumn: () =>
          updateSheet((s) =>
            deleteColumns(s, range.start.col, range.end.col - range.start.col + 1),
          ),
        addSheet: addNewSheet,
        renameSheet: () => void renameSheetAt(active),
        deleteSheet: () => void deleteSheetAt(active),
        showFunctions: () => setShowFunctions(true),
      },
    ),
    [
      past.length,
      future.length,
      activeStyle?.bold,
      activeStyle?.italic,
      activeStyle?.align,
      activeStyle?.format,
      range,
      active,
      workbook.sheets.length,
      undo,
      redo,
      cut,
      copy,
      paste,
      save,
      saveAs,
      open,
      exportCsv,
      close,
      clearSelection,
      selectAll,
      toggleBold,
      toggleItalic,
      setAlign,
      setFormat,
      insertRowAt,
      insertColumnAt,
      updateSheet,
      addNewSheet,
      renameSheetAt,
      deleteSheetAt,
      launch,
    ],
  );

  // ── formula bar and name box ────────────────────────────────────────────

  const formulaText = editor ? editor.text : cellText(sheet.cells[activeKey]);

  const onFormulaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCell(editor?.cell ?? selection.anchor, formulaText, 'down');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditor(null);
      focusGrid();
    }
  };

  const goToName = () => {
    const parsed = nameDraft ? parseRefOrRange(nameDraft) : null;
    if (parsed) selectRange(parsed.start, parsed.end);
    setNameDraft(null);
    focusGrid();
  };

  const alignButtons: Array<{ value: Align; label: string; icon: React.ReactNode }> = [
    { value: 'left', label: 'Align left', icon: <AlignLeft /> },
    { value: 'center', label: 'Align center', icon: <AlignCenter /> },
    { value: 'right', label: 'Align right', icon: <AlignRight /> },
  ];

  return (
    <AppFrame
      toolbar={
        <>
          <Toolbar dense windowControls>
            {/*
              The window has no title bar of its own now, so this row names it.
              It is also the strip the window drags from, which a plain span is.
            */}
            <span className="truncate-1 min-w-0 pr-1 text-base font-medium text-ink">
              {fileName}
            </span>
            <ToolbarGroup>
              <IconButton label="Bold" active={activeStyle?.bold} onClick={toggleBold}>
                <Bold />
              </IconButton>
              <IconButton label="Italic" active={activeStyle?.italic} onClick={toggleItalic}>
                <Italic />
              </IconButton>
            </ToolbarGroup>
            <Divider vertical className="mx-1 h-4" />
            <ToolbarGroup>
              {alignButtons.map((button) => (
                <IconButton
                  key={button.value}
                  label={button.label}
                  active={activeStyle?.align === button.value}
                  onClick={() => setAlign(button.value)}
                >
                  {button.icon}
                </IconButton>
              ))}
            </ToolbarGroup>
            <Divider vertical className="mx-1 h-4" />
            <Select
              size="sm"
              aria-label="Number format"
              options={NUMBER_FORMATS}
              value={activeStyle?.format ?? 'general'}
              onChange={setFormat}
            />
          </Toolbar>
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-rule bg-canvas px-2">
            <Input
              mono
              size="sm"
              aria-label="Name box"
              className="w-24 text-center"
              value={nameDraft ?? formatRange(range)}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => setNameDraft(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goToName();
                if (e.key === 'Escape') setNameDraft(null);
              }}
            />
            <span aria-hidden className="mono text-sm text-ink-3">
              fx
            </span>
            <Input
              mono
              size="sm"
              aria-label="Formula bar"
              className="flex-1"
              value={formulaText}
              onChange={(e) =>
                setEditor({
                  cell: editor?.cell ?? selection.anchor,
                  text: e.target.value,
                  caret: e.target.selectionStart ?? e.target.value.length,
                  source: editor?.source ?? 'bar',
                })
              }
              onKeyDown={onFormulaKeyDown}
            />
          </div>
        </>
      }
      statusBar={
        <>
          <span className="text-ink-2">{formatRange(range)}</span>
          <span className="tabular-nums">
            Sum {stats.count > 0 ? formatNumber(stats.sum, locale) : '—'}
          </span>
          <span className="tabular-nums">
            Avg {stats.average === null ? '—' : formatNumber(stats.average, locale)}
          </span>
          <span className="tabular-nums">Count {stats.count}</span>
          <span className="flex-1" />
          <span className="text-ink-3">{sheet.name}</span>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onGridKeyDown}>
        <Grid
          containerRef={gridRoot}
          sheet={sheet}
          values={values}
          selection={selection}
          onSelectionChange={(next) => selectRange(next.anchor, next.focus)}
          editor={editor}
          onEditorChange={setEditor}
          onCommit={commitCell}
          onFill={(source, target) => updateSheet((s) => fillRange(s, source, target))}
          onColumnResize={(col, width) => updateSheet((s) => setColumnWidth(s, col, width))}
          onRowResize={(row, height) => updateSheet((s) => setRowHeight(s, row, height))}
          onReferencePick={onReferencePick}
          size={size}
          locale={locale}
          currency={currency}
        />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-rule bg-canvas px-2">
        {workbook.sheets.map((tab, index) => (
          <button
            key={`${tab.name}-${index}`}
            type="button"
            aria-current={index === active}
            onClick={() => {
              setActive(index);
              setEditor(null);
              setSelection({ anchor: ORIGIN, focus: ORIGIN });
            }}
            onDoubleClick={() => void renameSheetAt(index)}
            className={cx(
              'h-6 rounded-sm px-2.5 text-sm lumen-focus select-none',
              'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
              index === active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {tab.name}
          </button>
        ))}
        <IconButton label="Add sheet" size="sm" onClick={addNewSheet}>
          <Plus />
        </IconButton>
        {workbook.sheets.length > 1 && (
          <IconButton label="Delete sheet" size="sm" onClick={() => void deleteSheetAt(active)}>
            <X />
          </IconButton>
        )}
      </div>
      <FunctionsDialog
        open={showFunctions}
        onClose={() => setShowFunctions(false)}
        container={container}
      />
    </AppFrame>
  );
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
}

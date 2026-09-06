import { useKernel, useVfs } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  AppFrame,
  Button,
  cx,
  EmptyState,
  IconButton,
  type MenuEntry,
  SearchField,
  SegmentedControl,
  Spinner,
  Toolbar,
  ToolbarSpacer,
  useContextMenu,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { BookOpen, ChevronLeft, Columns2, NotebookPen, PenLine, Plus } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useDirty,
  useFilePicker,
  useJsonFile,
  useLauncher,
  useNotify,
  useShortcutLabel,
  useTitle,
  useVfsWatch,
  useWindowControls,
} from '../_sdk';
import { frontPinned, frontTitle, parseDocument, serializeDocument } from './frontmatter';
import {
  countCharacters,
  countWords,
  DEFAULT_PREFS,
  deriveTitle,
  layoutFor,
  listNotes,
  listWidthFor,
  type Note,
  type NotesPrefs,
  normalizePrefs,
  type Pane,
  readingMinutes,
  type SortKey,
  tagCounts,
  type ViewMode,
} from './library';
import { toggleTaskAt, toPlainText } from './markdown';
import { buildNotesMenus, type NotesActions } from './menus';
import { NoteEditor } from './NoteEditor';
import { NoteList } from './NoteList';
import {
  createNote,
  duplicateNote,
  loadNotes,
  notesDir,
  renameNote,
  setPinnedText,
} from './storage';
import { TagRail } from './TagRail';
import {
  type InlineFormat,
  insertLink,
  type ListStyle,
  type Selection,
  setHeading,
  toggleInline,
  toggleList,
} from './wrap';

/** Typing pauses this long before the note is written. */
export const SAVE_DELAY = 600;

type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed';

const SAVE_LABELS: Record<SaveState, string> = {
  idle: '',
  unsaved: 'Unsaved',
  saving: 'Saving',
  saved: 'Saved',
  failed: 'Save failed',
};

const VIEW_OPTIONS = [
  { value: 'edit' as const, icon: <PenLine />, title: 'Edit' },
  { value: 'split' as const, icon: <Columns2 />, title: 'Split' },
  { value: 'preview' as const, icon: <BookOpen />, title: 'Preview' },
];

export default function Notes(props: AppProps) {
  const args = useArgs(props.args);
  const kernel = useKernel();
  const vfs = useVfs();
  const dialogs = useDialogs();
  const pickFile = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const { close, setDocument } = useWindowControls();
  const shortcutLabel = useShortcutLabel();

  const dir = useMemo(() => notesDir(kernel.home), [kernel.home]);
  const [storedPrefs, storePrefs, prefsState] = useJsonFile<NotesPrefs>(
    join(kernel.home, '.config', 'notes.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalizePrefs(storedPrefs), [storedPrefs]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>('list');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuPath, setMenuPath] = useState<string | null>(null);

  const [rootRef, rootSize] = useElementSize<HTMLDivElement>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pending = useRef<{ path: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writing = useRef(false);
  const nextSelection = useRef<Selection | null>(null);
  const started = useRef(false);
  const contextMenu = useContextMenu();

  const doc = useMemo(() => parseDocument(text), [text]);
  const rows = useMemo(
    () => listNotes(notes, { query, tag, sort: prefs.sort }),
    [notes, query, tag, prefs.sort],
  );
  const tags = useMemo(() => tagCounts(notes), [notes]);
  const current = useMemo(() => notes.find((n) => n.path === selected) ?? null, [notes, selected]);
  const title = current
    ? deriveTitle({ front: frontTitle(doc.front), body: doc.body, name: current.name })
    : 'Notes';
  const pinned = frontPinned(doc.front);
  const words = useMemo(() => countWords(doc.body), [doc.body]);
  const characters = useMemo(() => countCharacters(doc.body), [doc.body]);
  const totalMatches = rows.reduce((sum, row) => sum + row.matches, 0);
  const layout = layoutFor(rootSize.width, {
    showRail: prefs.showTags,
    pane,
    hasSelection: selected !== null,
  });

  useTitle(title);
  useDirty(saveState === 'unsaved' || saveState === 'failed');
  useEffect(() => {
    setDocument(selected);
  }, [selected, setDocument]);

  // ── loading ─────────────────────────────────────────────────────────────

  const reload = async (): Promise<Note[]> => {
    const list = await loadNotes(vfs, dir);
    setNotes(list);
    setLoading(false);
    return list;
  };

  const latest = useLatest({ reload, notes, selected, text, prefs });

  useEffect(() => {
    let cancelled = false;
    void loadNotes(vfs, dir)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, dir]);

  useVfsWatch(dir, () => {
    void latest.current.reload();
  });

  // Open the note the launcher asked for, else the one left open last time,
  // else whatever leads the list — which is not the first file on disk.
  useEffect(() => {
    if (started.current || loading || !prefsState.loaded) return;
    started.current = true;
    const wanted = typeof args.path === 'string' ? args.path : prefs.lastPath;
    const found = notes.find((n) => n.path === wanted) ?? rows[0]?.note;
    if (!found) return;
    setSelected(found.path);
    setText(found.text);
  }, [loading, prefsState.loaded, notes, rows, args.path, prefs.lastPath]);

  // Adopt changes made to the open note elsewhere, but never on top of an edit
  // that has not reached the disk yet.
  useEffect(() => {
    if (!current || pending.current || writing.current) return;
    setText((prev) => (prev === current.text ? prev : current.text));
  }, [current]);

  useEffect(() => {
    if (!selected) return;
    storePrefs((prev) => ({ ...normalizePrefs(prev), lastPath: selected }));
  }, [selected, storePrefs]);

  // ── saving ──────────────────────────────────────────────────────────────

  const flush = async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const job = pending.current;
    if (!job) return true;
    pending.current = null;
    writing.current = true;
    setSaveState('saving');
    try {
      await vfs.writeText(job.path, job.text, { recursive: true });
      setSaveState('saved');
      return true;
    } catch {
      pending.current = job;
      setSaveState('failed');
      return false;
    } finally {
      writing.current = false;
    }
  };

  const applyText = (next: string) => {
    const path = latest.current.selected;
    if (!path) return;
    setText(next);
    pending.current = { path, text: next };
    setSaveState('unsaved');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void handlers.current.flush(), SAVE_DELAY);
  };

  const applyBody = (body: string) => applyText(serializeDocument(doc.front, body));

  // A window that is torn down mid-edit still gets its last keystrokes out.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const job = pending.current;
      if (job) void vfs.writeText(job.path, job.text, { recursive: true });
    };
  }, [vfs]);

  useCloseGuard(async () => {
    if (await flush()) return true;
    return dialogs.confirm({
      title: 'This note could not be saved.',
      message: 'Closing now loses the changes made since the last save.',
      confirmLabel: 'Close Anyway',
      danger: true,
    });
  });

  // ── selection ───────────────────────────────────────────────────────────

  const selectNote = async (path: string) => {
    if (path === latest.current.selected) return;
    await flush();
    const note = latest.current.notes.find((n) => n.path === path);
    setSelected(path);
    setText(note?.text ?? '');
    setSaveState('idle');
  };

  const activate = async (path: string) => {
    await selectNote(path);
    setPane('editor');
    focusEditor();
  };

  const focusEditor = () => {
    requestAnimationFrame(() => textarea.current?.focus());
  };

  /** The note as it stands right now, including keystrokes not yet written. */
  const live = (note: Note): Note =>
    note.path === latest.current.selected ? { ...note, text: latest.current.text } : note;

  const target = (path?: string | null): Note | null => {
    const wanted = path ?? latest.current.selected;
    const note = latest.current.notes.find((n) => n.path === wanted);
    return note ? live(note) : null;
  };

  // ── commands ────────────────────────────────────────────────────────────

  const newNote = async () => {
    await flush();
    const path = await createNote(vfs, dir);
    const list = await reload();
    const note = list.find((n) => n.path === path);
    setSelected(path);
    setText(note?.text ?? '');
    setSaveState('idle');
    setPane('editor');
    setQuery('');
    setTag(null);
    focusEditor();
  };

  const duplicate = async (path?: string) => {
    const note = target(path);
    if (!note) return;
    await flush();
    const copy = await duplicateNote(vfs, note);
    const list = await reload();
    setSelected(copy);
    setText(list.find((n) => n.path === copy)?.text ?? '');
    setSaveState('idle');
  };

  const rename = async (path?: string) => {
    const note = target(path);
    if (!note) return;
    const name = await dialogs.prompt({
      title: 'Rename Note',
      message: 'The file is renamed to match.',
      defaultValue: note.title,
      confirmLabel: 'Rename',
      validate: (value) => (value.trim() ? null : 'Enter a title.'),
    });
    if (name === null) return;
    await flush();
    const next = await renameNote(vfs, note, name);
    const list = await reload();
    setSelected(next);
    setText(list.find((n) => n.path === next)?.text ?? '');
    setSaveState('saved');
  };

  const togglePin = async (path?: string) => {
    const note = target(path);
    if (!note) return;
    const wanted = !note.pinned;
    if (note.path === latest.current.selected) {
      applyText(setPinnedText(latest.current.text, wanted));
      return;
    }
    await vfs.writeText(note.path, setPinnedText(note.text, wanted));
    await reload();
  };

  const moveToTrash = async (path?: string) => {
    const note = target(path);
    if (!note) return;
    const ok = await dialogs.confirm({
      title: `Move “${note.title}” to the Trash?`,
      message: 'You can put it back from the Trash in Files.',
      confirmLabel: 'Move to Trash',
      danger: true,
    });
    if (!ok) return;
    if (pending.current?.path === note.path) pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    await vfs.trash(note.path);
    const list = await reload();
    if (note.path === latest.current.selected) {
      const next = list[0] ?? null;
      setSelected(next?.path ?? null);
      setText(next?.text ?? '');
      setSaveState('idle');
      setPane('list');
    }
  };

  const exportNote = async (kind: 'markdown' | 'text') => {
    const note = target();
    if (!note) return;
    const stem = note.name.replace(/\.(md|markdown)$/i, '');
    const dest = await pickFile({
      mode: 'save',
      title: kind === 'markdown' ? 'Export as Markdown' : 'Export as Plain Text',
      defaultName: kind === 'markdown' ? `${stem}.md` : `${stem}.txt`,
    });
    if (typeof dest !== 'string') return;
    const body = parseDocument(note.text).body;
    await vfs.writeText(dest, kind === 'markdown' ? note.text : toPlainText(body), {
      recursive: true,
    });
    notify('Note exported', kernel.labelFor(dest));
  };

  const find = () => {
    const input = searchInput.current;
    input?.focus();
    input?.select();
  };

  const setPref = <K extends keyof NotesPrefs>(key: K, value: NotesPrefs[K]) => {
    storePrefs((prev) => ({ ...normalizePrefs(prev), [key]: value }));
  };

  const toggleTags = () => setPref('showTags', !latest.current.prefs.showTags);

  // ── formatting ──────────────────────────────────────────────────────────

  const edit = (
    run: (body: string, selection: Selection) => { text: string; selection: Selection },
  ) => {
    const area = textarea.current;
    if (!area || !latest.current.selected) return;
    const result = run(area.value, { start: area.selectionStart, end: area.selectionEnd });
    nextSelection.current = result.selection;
    applyBody(result.text);
  };

  // The caret has to be restored after React has written the new value back.
  useEffect(() => {
    const selection = nextSelection.current;
    const area = textarea.current;
    if (!selection || !area) return;
    nextSelection.current = null;
    area.focus();
    area.setSelectionRange(selection.start, selection.end);
  });

  const handlers = useLatest({
    flush,
    newNote,
    duplicate,
    rename,
    togglePin,
    moveToTrash,
    exportNote,
    find,
    setPref,
    toggleTags,
    edit,
    close,
    launch,
  });

  const actions = useMemo<NotesActions>(
    () => ({
      newNote: () => void handlers.current.newNote(),
      duplicate: () => void handlers.current.duplicate(),
      rename: () => void handlers.current.rename(),
      togglePin: () => void handlers.current.togglePin(),
      moveToTrash: () => void handlers.current.moveToTrash(),
      exportMarkdown: () => void handlers.current.exportNote('markdown'),
      exportText: () => void handlers.current.exportNote('text'),
      close: () => void handlers.current.close(),
      find: () => handlers.current.find(),
      setView: (view: ViewMode) => handlers.current.setPref('view', view),
      setSort: (sort: SortKey) => handlers.current.setPref('sort', sort),
      toggleTags: () => handlers.current.toggleTags(),
      format: (format: InlineFormat) =>
        handlers.current.edit((body, sel) => toggleInline(body, sel, format)),
      link: () => handlers.current.edit((body, sel) => insertLink(body, sel)),
      heading: (level: number) =>
        handlers.current.edit((body, sel) => setHeading(body, sel, level)),
      list: (style: ListStyle) =>
        handlers.current.edit((body, sel) => toggleList(body, sel, style)),
      help: () => handlers.current.launch('lumen.help', { section: 'notes' }),
    }),
    [handlers],
  );

  const menuState = {
    hasNote: selected !== null,
    pinned,
    view: prefs.view,
    sort: prefs.sort,
    showTags: prefs.showTags,
    searchFocused,
  };

  useAppMenus(buildNotesMenus(menuState, actions), [
    actions,
    menuState.hasNote,
    menuState.pinned,
    menuState.view,
    menuState.sort,
    menuState.showTags,
    menuState.searchFocused,
  ]);

  // ── render ──────────────────────────────────────────────────────────────

  // The commands read live state through refs, so only the row matters here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handlers stay current through useLatest
  const contextItems: MenuEntry[] = useMemo(() => {
    const note = notes.find((n) => n.path === menuPath);
    if (!note) return [];
    return [
      { id: 'open', label: 'Open', onSelect: () => void activate(note.path) },
      {
        id: 'pin',
        label: note.pinned ? 'Unpin' : 'Pin to Top',
        onSelect: () => void togglePin(note.path),
      },
      { type: 'separator' },
      { id: 'duplicate', label: 'Duplicate', onSelect: () => void duplicate(note.path) },
      { id: 'rename', label: 'Rename…', onSelect: () => void rename(note.path) },
      { type: 'separator' },
      {
        id: 'trash',
        label: 'Move to Trash',
        danger: true,
        onSelect: () => void moveToTrash(note.path),
      },
    ];
  }, [notes, menuPath]);

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    setQuery('');
    textarea.current?.focus();
  };

  const statusBar = current ? (
    <>
      <span className="tabular-nums">{words} words</span>
      <span className="tabular-nums">{characters} characters</span>
      <span className="tabular-nums">{readingMinutes(words)} min read</span>
      <ToolbarSpacer />
      <span className="truncate-1 hidden text-ink-3 sm:inline">{current.name}</span>
      <span className={cx(saveState === 'failed' ? 'text-danger' : 'text-ink-2')}>
        {SAVE_LABELS[saveState]}
      </span>
    </>
  ) : (
    <>
      <span className="tabular-nums">{notes.length} notes</span>
      <ToolbarSpacer />
      <span className="text-ink-3">{kernel.labelFor(dir)}</span>
    </>
  );

  return (
    <div ref={rootRef} className="flex h-full w-full flex-col">
      <AppFrame
        toolbar={
          <Toolbar dense windowControls>
            {layout.back && (
              <IconButton label="Back to notes" size="sm" onClick={() => setPane('list')}>
                <ChevronLeft />
              </IconButton>
            )}
            {/* The window has no title bar of its own, so this row names it. */}
            <span className="truncate-1 mr-1 min-w-0 max-w-56 text-base font-medium text-ink">
              {title}
            </span>
            <div className="min-w-20 max-w-64 flex-1">
              <SearchField
                ref={searchInput}
                size="sm"
                value={query}
                onChange={setQuery}
                onKeyDown={onSearchKeyDown}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search notes"
                aria-label="Search notes"
              />
            </div>
            {query.trim() !== '' && (
              <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                {totalMatches} in {rows.length}
              </span>
            )}
            <ToolbarSpacer />
            {/* Folded to the editor alone, the row gives the switcher's place
                to the note's name; View still carries the three modes. */}
            {selected !== null && layout.editor && !layout.back && (
              <SegmentedControl
                size="sm"
                aria-label="View mode"
                options={VIEW_OPTIONS}
                value={prefs.view}
                onChange={(view) => setPref('view', view)}
              />
            )}
            <IconButton label="New note" size="sm" onClick={() => void newNote()}>
              <Plus />
            </IconButton>
          </Toolbar>
        }
        sidebar={
          layout.rail ? (
            <TagRail tags={tags} activeTag={tag} total={notes.length} onSelect={setTag} />
          ) : undefined
        }
        statusBar={statusBar}
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              {layout.list && (
                <NoteList
                  rows={rows}
                  selectedPath={selected}
                  sort={prefs.sort}
                  searching={query.trim() !== ''}
                  newShortcut={shortcutLabel('Mod+N')}
                  onSort={(sort) => setPref('sort', sort)}
                  onSelect={(path) => void (layout.editor ? selectNote(path) : activate(path))}
                  onActivate={(path) => void activate(path)}
                  onContextMenu={(path, e) => {
                    setMenuPath(path);
                    void selectNote(path);
                    contextMenu.openAt(e);
                  }}
                  className={layout.editor ? 'shrink-0' : 'flex-1'}
                  style={layout.editor ? { width: listWidthFor(rootSize.width) } : undefined}
                />
              )}
              {layout.editor &&
                (selected !== null ? (
                  <NoteEditor
                    body={doc.body}
                    bodyLine={doc.bodyLine}
                    view={prefs.view}
                    textareaRef={textarea}
                    onChange={applyBody}
                    onBlur={() => void flush()}
                    onToggleTask={(line) => applyText(toggleTaskAt(text, line))}
                  />
                ) : (
                  <div className="flex min-w-0 flex-1 bg-surface">
                    <EmptyState
                      icon={<NotebookPen />}
                      title="No note open"
                      description="Pick one from the list, or start a new one."
                      action={
                        <Button icon={<Plus />} onClick={() => void newNote()}>
                          New Note
                          <span className="mono ml-1 text-xs text-ink-3">
                            {shortcutLabel('Mod+N')}
                          </span>
                        </Button>
                      }
                    />
                  </div>
                ))}
            </>
          )}
        </div>
      </AppFrame>
      <AnchoredMenu
        open={contextMenu.open}
        at={contextMenu.at}
        items={contextItems}
        onClose={contextMenu.close}
      />
    </div>
  );
}

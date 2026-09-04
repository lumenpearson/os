import { useKernel, useVfs } from '@lumen/kernel/react';
import { Button, useDialogs } from '@lumen/ui';
import { basename } from '@lumen/vfs';
import { FileWarning } from 'lucide-react';
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type AppProps,
  formatDate,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useDirty,
  useFilePicker,
  useLauncher,
  useNotify,
  useShortcut,
  useShortcutLabel,
  useTitle,
  useWindowControls,
} from '../_sdk';
import {
  documentTitle,
  exportHtmlDocument,
  isEmptyDocument,
  OPEN_EXTENSIONS,
  openDocument,
  SAVE_EXTENSIONS,
  serializeFor,
  suggestedName,
  WRITER_EXTENSION,
} from './document';
import {
  ALIGN_COMMANDS,
  type Alignment,
  type BlockType,
  closestLink,
  type EditorState,
  exec,
  formatBlockValue,
  INITIAL_EDITOR_STATE,
  isInside,
  isInsideList,
  type Mark,
  readEditorState,
  anchorHtml,
  unwrapElement,
} from './editing';
import { FindBar } from './FindBar';
import {
  buildTextIndex,
  clearMatches,
  findMatches,
  rangeForMatch,
  scrollRangeIntoView,
  selectRange,
  showMatches,
  stepMatch,
} from './find';
import { htmlToMarkdown } from './markdown';
import { buildMenus, type ExportFormat, type WriterActions } from './menus';
import { EMPTY_DOCUMENT, normalizeLinkInput, sanitizeHtml } from './sanitize';
import { htmlToPlainText, type TextStats, textStats } from './stats';
import { WRITER_CSS } from './styles';
import { WriterToolbar } from './WriterToolbar';

const APP_ID = 'lumen.writer';
const SYNC_DELAY = 180;
const EMPTY_STATS: TextStats = { words: 0, characters: 0, charactersNoSpaces: 0, minutes: 0 };

const EXPORTS: Record<ExportFormat, { label: string; extension: string }> = {
  html: { label: 'HTML', extension: '.html' },
  markdown: { label: 'Markdown', extension: '.md' },
  text: { label: 'Plain Text', extension: '.txt' },
};

const SHORTCUT_HELP: Array<[string, string]> = [
  ['Mod+S', 'Save'],
  ['Mod+O', 'Open'],
  ['Mod+F', 'Find'],
  ['Mod+G', 'Find next'],
  ['Mod+B', 'Bold'],
  ['Mod+I', 'Italic'],
  ['Mod+U', 'Underline'],
  ['Shift+Mod+X', 'Strikethrough'],
  ['Mod+K', 'Link'],
  ['Shift+Mod+8', 'Bulleted list'],
  ['Shift+Mod+7', 'Numbered list'],
  ['Mod+]', 'Indent'],
  ['Mod+[', 'Outdent'],
  ['Mod+\\', 'Clear formatting'],
  ['Shift+Mod+R', 'Reading mode'],
];

export default function Writer({ args: launchArgs }: AppProps) {
  const args = useArgs(launchArgs);
  const argPath = typeof args.path === 'string' ? args.path : null;

  const vfs = useVfs();
  const kernel = useKernel();
  const dialogs = useDialogs();
  const pickFile = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const controls = useWindowControls();
  const shortcutLabel = useShortcutLabel();

  const pageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const savedHtml = useRef(EMPTY_DOCUMENT);
  const lastRange = useRef<Range | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);

  const [path, setPath] = useState<string | null>(argPath);
  const [readOnly, setReadOnly] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(argPath !== null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TextStats>(EMPTY_STATS);
  const [editor, setEditor] = useState<EditorState>(INITIAL_EDITOR_STATE);
  const [readingMode, setReadingMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const name = path === null ? 'Untitled' : basename(path);
  const title = documentTitle(path);
  useTitle(name);
  useDirty(dirty);

  const setDocumentPath = controls.setDocument;
  useEffect(() => {
    setDocumentPath(path);
  }, [setDocumentPath, path]);

  // ── document state ──────────────────────────────────────────────────────

  const currentHtml = useCallback(() => pageRef.current?.innerHTML ?? savedHtml.current, []);

  const refreshStats = useCallback(() => {
    const page = pageRef.current;
    if (page === null) return;
    setStats(textStats(page.innerText));
    page.dataset.empty = String(isEmptyDocument(page.innerHTML));
  }, []);

  const applyFind = useCallback((text: string, index: number) => {
    const page = pageRef.current;
    if (page === null) return;
    clearMatches();
    if (text === '') {
      setMatchCount(0);
      setMatchIndex(0);
      return;
    }
    const textIndex = buildTextIndex(page);
    const matches = findMatches(textIndex.text, text);
    setMatchCount(matches.length);
    if (matches.length === 0) return;
    const at = Math.min(Math.max(index, 0), matches.length - 1);
    setMatchIndex(at);
    const ranges: Range[] = [];
    for (const match of matches) {
      const range = rangeForMatch(textIndex, match);
      if (range !== null) ranges.push(range);
    }
    const current = ranges[at] ?? null;
    if (!showMatches(ranges, current) && current !== null) selectRange(current);
    if (current !== null && scrollRef.current !== null) {
      scrollRangeIntoView(current, scrollRef.current);
    }
  }, []);

  const findState = useRef({ open: false, query: '', index: 0 });
  findState.current = { open: findOpen, query, index: matchIndex };

  const scheduleSync = useCallback(() => {
    if (syncTimer.current !== null) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null;
      const page = pageRef.current;
      if (page === null) return;
      setDirty(page.innerHTML !== savedHtml.current);
      refreshStats();
      const find = findState.current;
      if (find.open) applyFind(find.query, find.index);
    }, SYNC_DELAY);
  }, [refreshStats, applyFind]);

  const markEdited = useCallback(() => {
    const page = pageRef.current;
    if (page === null) return;
    setDirty(true);
    setEditor(readEditorState(page));
    scheduleSync();
  }, [scheduleSync]);

  const applyHtml = useCallback(
    (html: string) => {
      const page = pageRef.current;
      if (page !== null) page.innerHTML = html;
      savedHtml.current = html;
      setDirty(false);
      refreshStats();
    },
    [refreshStats],
  );

  useEffect(() => {
    if (argPath === null) {
      applyHtml(EMPTY_DOCUMENT);
      setPath(null);
      setReadOnly(false);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    vfs
      .readText(argPath)
      .then((raw) => {
        if (cancelled) return;
        const opened = openDocument(argPath, raw);
        applyHtml(opened.html);
        setPath(argPath);
        setReadOnly(opened.readOnly);
        setError(null);
        kernel.addRecent(argPath, APP_ID);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [argPath, vfs, kernel, applyHtml]);

  useEffect(() => {
    const onSelectionChange = () => {
      const page = pageRef.current;
      if (page === null) return;
      const selection = document.getSelection();
      if (selection === null || !isInside(page, selection.anchorNode)) return;
      if (selection.rangeCount > 0) lastRange.current = selection.getRangeAt(0).cloneRange();
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setEditor(readEditorState(page));
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (syncTimer.current !== null) clearTimeout(syncTimer.current);
      clearMatches();
    };
  }, []);

  // ── commands ────────────────────────────────────────────────────────────

  const focusPage = useCallback(() => {
    const page = pageRef.current;
    if (page === null) return;
    const selection = document.getSelection();
    page.focus({ preventScroll: true });
    if (selection !== null && !isInside(page, selection.anchorNode)) {
      const range = lastRange.current;
      if (range !== null && isInside(page, range.startContainer)) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, []);

  const command = useCallback(
    (name_: string, value?: string) => {
      if (readOnly) return;
      focusPage();
      exec(name_, value);
      markEdited();
    },
    [readOnly, focusPage, markEdited],
  );

  // ── files ───────────────────────────────────────────────────────────────

  const saveTo = useCallback(
    async (target: string): Promise<boolean> => {
      const html = currentHtml();
      try {
        await vfs.writeText(target, serializeFor(target, html, documentTitle(target)), {
          recursive: true,
        });
      } catch (cause: unknown) {
        await dialogs.alert({ title: 'Could not save', message: messageOf(cause) });
        return false;
      }
      savedHtml.current = html;
      setPath(target);
      setDirty(false);
      setReadOnly(false);
      setError(null);
      kernel.addRecent(target, APP_ID);
      return true;
    },
    [currentHtml, vfs, dialogs, kernel],
  );

  const saveAs = useCallback(async (): Promise<boolean> => {
    const chosen = await pickFile({
      mode: 'save',
      title: 'Save Document',
      defaultName: suggestedName(path, WRITER_EXTENSION),
      extensions: SAVE_EXTENSIONS,
      confirmLabel: 'Save',
    });
    return typeof chosen === 'string' ? saveTo(chosen) : false;
  }, [pickFile, path, saveTo]);

  const save = useCallback(async (): Promise<boolean> => {
    if (path === null || readOnly) return saveAs();
    return saveTo(path);
  }, [path, readOnly, saveAs, saveTo]);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const choice = await dialogs.choose({
      title: `Save changes to ${name}?`,
      message: 'Changes since the last save will be lost.',
      buttons: [
        { id: 'discard', label: "Don't Save" },
        { id: 'cancel', label: 'Cancel' },
        { id: 'save', label: 'Save', variant: 'primary' },
      ],
    });
    if (choice === 'save') return save();
    return choice === 'discard';
  }, [dirty, name, dialogs, save]);

  useCloseGuard(dirty ? confirmDiscard : null);

  const openFile = useCallback(async () => {
    const chosen = await pickFile({
      mode: 'open',
      title: 'Open Document',
      extensions: OPEN_EXTENSIONS,
    });
    if (typeof chosen !== 'string') return;
    if (!(await confirmDiscard())) return;
    try {
      const opened = openDocument(chosen, await vfs.readText(chosen));
      applyHtml(opened.html);
      setPath(chosen);
      setReadOnly(opened.readOnly);
      setError(null);
      kernel.addRecent(chosen, APP_ID);
    } catch (cause: unknown) {
      await dialogs.alert({ title: 'Could not open', message: messageOf(cause) });
    }
  }, [pickFile, confirmDiscard, vfs, applyHtml, kernel, dialogs]);

  const exportAs = useCallback(
    async (format: ExportFormat) => {
      const { label, extension } = EXPORTS[format];
      const chosen = await pickFile({
        mode: 'save',
        title: `Export as ${label}`,
        defaultName: suggestedName(path, extension),
        confirmLabel: 'Export',
      });
      if (typeof chosen !== 'string') return;
      const html = currentHtml();
      const body =
        format === 'html'
          ? exportHtmlDocument(html, title)
          : format === 'markdown'
            ? htmlToMarkdown(html)
            : `${htmlToPlainText(html)}\n`;
      try {
        await vfs.writeText(chosen, body, { recursive: true });
        notify('Export finished', basename(chosen));
      } catch (cause: unknown) {
        await dialogs.alert({ title: 'Could not export', message: messageOf(cause) });
      }
    },
    [pickFile, path, currentHtml, title, vfs, notify, dialogs],
  );

  // ── formatting ──────────────────────────────────────────────────────────

  const link = useCallback(async () => {
    const page = pageRef.current;
    if (page === null || readOnly) return;
    const selection = document.getSelection();
    const existing = closestLink(selection?.anchorNode ?? null, page);
    const collapsed = selection === null || selection.isCollapsed;
    const answer = await dialogs.prompt({
      title: existing === null ? 'Add link' : 'Edit link',
      message: 'Web address. http, https and mailto only.',
      defaultValue: existing?.getAttribute('href') ?? '',
      placeholder: 'https://example.com',
      confirmLabel: existing === null ? 'Add' : 'Update',
      mono: true,
      validate: (value) =>
        value.trim() === '' || normalizeLinkInput(value) !== null
          ? null
          : 'Use an http, https or mailto address.',
    });
    if (answer === null) return;
    const href = normalizeLinkInput(answer);
    if (href === null) {
      if (existing !== null) {
        unwrapElement(existing);
        markEdited();
      }
      return;
    }
    if (existing !== null) {
      existing.setAttribute('href', href);
      markEdited();
      return;
    }
    focusPage();
    if (collapsed) exec('insertHTML', anchorHtml(href, href));
    else exec('createLink', href);
    markEdited();
  }, [readOnly, dialogs, focusPage, markEdited]);

  const removeLink = useCallback(() => {
    const page = pageRef.current;
    if (page === null || readOnly) return;
    const selection = document.getSelection();
    if (selection !== null && !selection.isCollapsed) {
      command('unlink');
      return;
    }
    const existing = closestLink(selection?.anchorNode ?? null, page);
    if (existing === null) return;
    unwrapElement(existing);
    markEdited();
  }, [readOnly, command, markEdited]);

  const clearFormatting = useCallback(() => {
    if (readOnly) return;
    focusPage();
    exec('removeFormat');
    exec('unlink');
    markEdited();
  }, [readOnly, focusPage, markEdited]);

  const selectAll = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.select();
      return;
    }
    focusPage();
    exec('selectAll');
  }, [focusPage]);

  const pasteFromClipboard = useCallback(async () => {
    if (readOnly) return;
    try {
      const clipboard = navigator.clipboard;
      if (typeof clipboard?.read === 'function') {
        for (const item of await clipboard.read()) {
          if (!item.types.includes('text/html')) continue;
          const html = await (await item.getType('text/html')).text();
          focusPage();
          exec('insertHTML', sanitizeHtml(html));
          markEdited();
          return;
        }
      }
      const text = await clipboard.readText();
      focusPage();
      exec('insertText', text);
      markEdited();
    } catch {
      notify('Could not read the clipboard', 'Use the paste shortcut inside the page instead.');
    }
  }, [readOnly, focusPage, markEdited, notify]);

  // ── find ────────────────────────────────────────────────────────────────

  const openFind = useCallback(() => {
    setFindOpen(true);
    setReadingMode(false);
    requestAnimationFrame(() => findInputRef.current?.select());
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setQuery('');
    clearMatches();
    setMatchCount(0);
    setMatchIndex(0);
    focusPage();
  }, [focusPage]);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (matchCount === 0) {
        if (query !== '') applyFind(query, 0);
        return;
      }
      const next = stepMatch(matchIndex, matchCount, direction);
      setMatchIndex(next);
      applyFind(query, next);
    },
    [matchCount, matchIndex, query, applyFind],
  );

  useEffect(() => {
    if (!findOpen) {
      clearMatches();
      return;
    }
    applyFind(query, 0);
  }, [findOpen, query, applyFind]);

  useShortcut('Escape', () => {
    if (findOpen) closeFind();
    else if (readingMode) setReadingMode(false);
  });

  // ── menus ───────────────────────────────────────────────────────────────

  const actions = useMemo<WriterActions>(
    () => ({
      newDocument: () => launch(APP_ID, {}),
      open: () => void openFile(),
      save: () => void save(),
      saveAs: () => void saveAs(),
      exportAs: (format) => void exportAs(format),
      closeWindow: () => void controls.close(),
      undo: () => command('undo'),
      redo: () => command('redo'),
      cut: () => command('cut'),
      copy: () => {
        focusPage();
        exec('copy');
      },
      paste: () => void pasteFromClipboard(),
      selectAll,
      find: openFind,
      findNext: () => step(1),
      findPrevious: () => step(-1),
      setBlock: (block: BlockType) => command('formatBlock', formatBlockValue(block)),
      toggleMark: (mark: Mark) => command(mark),
      toggleList: (kind) =>
        command(kind === 'bullet' ? 'insertUnorderedList' : 'insertOrderedList'),
      setAlignment: (align: Alignment) => command(ALIGN_COMMANDS[align]),
      indent: () => command('indent'),
      outdent: () => command('outdent'),
      link: () => void link(),
      removeLink,
      clearFormatting,
      insertRule: () => command('insertHorizontalRule'),
      insertDate: () => command('insertText', formatDate(Date.now())),
      toggleReadingMode: () => setReadingMode((value) => !value),
      toggleFullScreen: () => controls.setFullscreen(!controls.window?.fullscreen),
      showShortcuts: () =>
        void dialogs.alert({
          title: 'Keyboard shortcuts',
          message: (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
              {SHORTCUT_HELP.map(([keys, description]) => (
                <div key={keys} className="contents">
                  <dt className="mono text-sm text-ink-2">{shortcutLabel(keys)}</dt>
                  <dd className="text-ink">{description}</dd>
                </div>
              ))}
            </dl>
          ),
        }),
      showAbout: () =>
        void dialogs.alert({
          title: 'Writer',
          message:
            'A word processor for Lumen. Documents are saved as .lwr files: JSON holding the document HTML, which exports to HTML, Markdown and plain text.',
        }),
    }),
    [
      launch,
      openFile,
      save,
      saveAs,
      exportAs,
      controls,
      command,
      focusPage,
      pasteFromClipboard,
      selectAll,
      openFind,
      step,
      link,
      removeLink,
      clearFormatting,
      dialogs,
      shortcutLabel,
    ],
  );

  const fullscreen = controls.window?.fullscreen ?? false;
  useAppMenus(
    buildMenus({ editor, readOnly, readingMode, fullscreen, hasMatches: matchCount > 0 }, actions),
    [editor, readOnly, readingMode, fullscreen, matchCount, actions],
  );

  // ── editor events ───────────────────────────────────────────────────────

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (readOnly) return;
      const data = event.clipboardData;
      const html = data.getData('text/html');
      if (html.trim() !== '') exec('insertHTML', sanitizeHtml(html));
      else exec('insertText', data.getData('text/plain'));
      markEdited();
    },
    [readOnly, markEdited],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const page = pageRef.current;
      if (readOnly || page === null) return;
      if (event.key === 'Tab') {
        const selection = document.getSelection();
        if (isInsideList(selection?.anchorNode ?? null, page)) {
          event.preventDefault();
          command(event.shiftKey ? 'outdent' : 'indent');
        }
        return;
      }
      // Shift+Mod+7/8 arrive as "&" and "*" on many layouts; match the key position.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.code === 'Digit8') {
          event.preventDefault();
          command('insertUnorderedList');
        } else if (event.code === 'Digit7') {
          event.preventDefault();
          command('insertOrderedList');
        }
      }
    },
    [readOnly, command],
  );

  const editable = !readOnly && !readingMode;

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <style>{WRITER_CSS}</style>
      {!readingMode && (
        <WriterToolbar
          editor={editor}
          readOnly={readOnly}
          readingMode={readingMode}
          findOpen={findOpen}
          actions={actions}
        />
      )}
      {findOpen && !readingMode && (
        <FindBar
          query={query}
          onQueryChange={setQuery}
          index={matchIndex}
          total={matchCount}
          inputRef={findInputRef}
          onNext={() => step(1)}
          onPrevious={() => step(-1)}
          onClose={closeFind}
        />
      )}
      {error !== null && (
        <p className="shrink-0 border-b border-rule bg-surface-2 px-3 py-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      {readOnly && error === null && (
        <div className="flex shrink-0 items-center gap-2 border-b border-rule bg-surface-2 px-3 py-1.5">
          <FileWarning aria-hidden className="size-3.5 shrink-0 text-ink-2" />
          <p className="text-sm text-ink-2">
            RTF is imported as text. Save as {WRITER_EXTENSION} to edit it.
          </p>
          <div className="flex-1" />
          <Button size="sm" onClick={() => void saveAs()}>
            Save As…
          </Button>
        </div>
      )}
      <div ref={scrollRef} className="lumen-scroll writer-scroll flex-1">
        <div className="px-4 py-6">
          <div
            ref={pageRef}
            role="textbox"
            tabIndex={0}
            aria-multiline="true"
            aria-label="Document"
            aria-readonly={!editable}
            spellCheck
            contentEditable={editable}
            suppressContentEditableWarning
            className="writer-page mx-auto max-w-[720px] rounded-md border border-rule bg-surface shadow-sm"
            onInput={markEdited}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-4 border-t border-rule bg-canvas px-3">
        <span className="mono shrink-0 text-xs text-ink-2 tabular-nums">
          {stats.words.toLocaleString()} words
        </span>
        <span className="mono shrink-0 text-xs text-ink-2 tabular-nums">
          {stats.characters.toLocaleString()} characters
        </span>
        {stats.minutes > 0 && (
          <span className="mono shrink-0 text-xs text-ink-2 tabular-nums">
            {stats.minutes} min read
          </span>
        )}
        <div className="flex-1" />
        {readingMode && (
          <Button size="sm" variant="ghost" onClick={() => setReadingMode(false)}>
            Exit reading mode
          </Button>
        )}
        <span className="mono truncate-1 text-xs text-ink-3">
          {loading ? 'Opening…' : (path ?? 'Not saved')}
        </span>
      </div>
    </div>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

import { useKernel, useVfs } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  AppFrame,
  Button,
  Divider,
  EmptyState,
  IconButton,
  Spinner,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { basename, dirname, join, mimeType, type Vfs, VfsError } from '@lumen/vfs';
import {
  ChevronDown,
  Copy,
  FileWarning,
  Moon,
  PanelRight,
  Play,
  Plus,
  Presentation,
  Scan,
  Sun,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useShortcut,
  useTitle,
  useWindowControls,
} from '../_sdk';
import {
  COALESCE_MS,
  canRedo,
  canUndo,
  createDeck,
  createHistory,
  DEFAULT_PREFS,
  type Deck,
  type DeckAction,
  type DeckHistory,
  type DeckTheme,
  fitScale,
  LAYOUT_LABELS,
  nextSelection,
  normalizeDeck,
  normalizePrefs,
  pushHistory,
  redo,
  reduceDeck,
  replacePresent,
  SLIDE_LAYOUTS,
  type SlideLayout,
  type SlidePatch,
  type SlidesPrefs,
  serializeDeck,
  undo,
} from './deck';
import { exportDeckHtml, type ImageSources, imageDataUrl } from './export';
import { Inspector } from './Inspector';
import { buildSlidesMenus, type SlidesActions } from './menus';
import { Presenter } from './Presenter';
import { SlideCanvas } from './SlideCanvas';
import { SlideList } from './SlideList';

const DEFAULT_NAME = 'Untitled.lsl';
/** The canvas never blows a slide up past this, however wide the pane is. */
const MAX_CANVAS_SCALE = 1.5;

function describe(error: unknown): string {
  return VfsError.is(error) || error instanceof Error ? error.message : String(error);
}

/** Read every picture a deck uses so the exported file carries them inline. */
async function collectImages(vfs: Vfs, deck: Deck): Promise<ImageSources> {
  const sources: Record<string, string> = {};
  for (const slide of deck.slides) {
    const source = slide.imagePath;
    if (!source || sources[source]) continue;
    try {
      sources[source] = imageDataUrl(mimeType(source), await vfs.readFile(source));
    } catch {
      // A picture that has since moved simply exports without one.
    }
  }
  return sources;
}

export default function Slides(props: AppProps) {
  const args = useArgs(props.args);
  const vfs = useVfs();
  const kernel = useKernel();
  const dialogs = useDialogs();
  const pick = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const controls = useLatest(useWindowControls());

  const [path, setPath] = useState<string | null>(typeof args.path === 'string' ? args.path : null);
  const [history, setHistory] = useState<DeckHistory>(() => createHistory(createDeck()));
  const [savedText, setSavedText] = useState(() => serializeDeck(createDeck()));
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(typeof args.path === 'string');
  const [error, setError] = useState<string | null>(null);
  const [zoomFit, setZoomFit] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [layoutMenu, setLayoutMenu] = useState(false);

  const [storedPrefs, storePrefs] = useJsonFile<SlidesPrefs>(
    join(kernel.home, '.config', 'slides.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalizePrefs(storedPrefs), [storedPrefs]);

  const deck = history.present;
  const text = useMemo(() => serializeDeck(deck), [deck]);
  const dirty = text !== savedText;
  const slide = deck.slides[selected];
  const theme: DeckTheme = deck.theme ?? 'light';

  const historyRef = useLatest(history);
  const selectedRef = useLatest(selected);
  const pathRef = useLatest(path);
  const dirtyRef = useLatest(dirty);
  const lastEdit = useRef<{ key: string; at: number } | null>(null);
  const layoutButton = useRef<HTMLButtonElement>(null);
  const [paneRef, pane] = useElementSize<HTMLDivElement>();

  const scale = zoomFit ? fitScale(pane, { maxScale: MAX_CANVAS_SCALE }) : 1;

  // ── document ────────────────────────────────────────────────────────────

  const openPath = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        const parsed = normalizeDeck(await vfs.readJson<unknown>(target), basename(target, true));
        setHistory(createHistory(parsed));
        setSavedText(serializeDeck(parsed));
        setPath(target);
        setSelected(0);
        setError(null);
        kernel.addRecent(target, 'lumen.slides');
      } catch (cause) {
        setError(describe(cause));
      } finally {
        setLoading(false);
      }
    },
    [vfs, kernel],
  );

  useEffect(() => {
    if (typeof args.path === 'string') void openPath(args.path);
  }, [args.path, openPath]);

  useTitle(path ? basename(path) : 'Untitled');
  useDirty(dirty);
  useEffect(() => {
    controls.current.setDocument(path);
  }, [path, controls]);

  // A shorter deck (undo, delete) must not leave the selection past the end.
  useEffect(() => {
    const highest = Math.max(0, deck.slides.length - 1);
    setSelected((current) => Math.min(current, highest));
  }, [deck.slides.length]);

  // ── editing ─────────────────────────────────────────────────────────────

  const run = useCallback(
    (action: DeckAction, coalesceKey?: string) => {
      const now = Date.now();
      const previous = lastEdit.current;
      const merge =
        coalesceKey !== undefined &&
        previous?.key === coalesceKey &&
        now - previous.at < COALESCE_MS;
      lastEdit.current = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
      setSelected((current) => nextSelection(action, historyRef.current.present, current));
      setHistory((current) => {
        const next = reduceDeck(current.present, action);
        if (next === current.present) return current;
        return merge ? replacePresent(current, next) : pushHistory(current, next);
      });
    },
    [historyRef],
  );

  const patchSlide = useCallback(
    (patch: SlidePatch, coalesce = true) => {
      const index = selectedRef.current;
      const key = coalesce ? `${index}:${Object.keys(patch).join(',')}` : undefined;
      run({ type: 'update', index, patch }, key);
    },
    [run, selectedRef],
  );

  const addSlide = useCallback(
    (layout?: SlideLayout) => {
      const current = historyRef.current.present;
      const index = selectedRef.current;
      const inherited = current.slides[index]?.layout;
      run({
        type: 'add',
        index: current.slides.length === 0 ? -1 : index,
        layout: layout ?? (inherited === 'title' ? 'bullets' : (inherited ?? 'bullets')),
      });
    },
    [run, historyRef, selectedRef],
  );

  const duplicateSlide = useCallback(
    (index = selectedRef.current) => run({ type: 'duplicate', index }),
    [run, selectedRef],
  );
  const deleteSlide = useCallback(
    (index = selectedRef.current) => run({ type: 'delete', index }),
    [run, selectedRef],
  );
  const reorder = useCallback((from: number, to: number) => run({ type: 'move', from, to }), [run]);

  const stepHistory = useCallback((direction: 'undo' | 'redo') => {
    lastEdit.current = null;
    setHistory((current) => (direction === 'undo' ? undo(current) : redo(current)));
  }, []);

  const chooseImage = useCallback(async () => {
    const chosen = await pick({
      mode: 'open',
      title: 'Choose Image',
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'],
      startDir: join(kernel.home, 'Pictures'),
    });
    const target = typeof chosen === 'string' ? chosen : (chosen?.[0] ?? null);
    if (target) patchSlide({ imagePath: target, layout: 'image' }, false);
  }, [pick, kernel, patchSlide]);

  const renameDeck = useCallback(async () => {
    const answer = await dialogs.prompt({
      title: 'Presentation Title',
      message: 'Shown on the exported file and used as its name.',
      defaultValue: historyRef.current.present.title,
      confirmLabel: 'Rename',
    });
    if (answer !== null) run({ type: 'setTitle', title: answer.trim() || 'Untitled' });
  }, [dialogs, run, historyRef]);

  // ── files ───────────────────────────────────────────────────────────────

  const writeTo = useCallback(
    async (target: string) => {
      const body = serializeDeck(historyRef.current.present);
      await vfs.writeText(target, body, { recursive: true });
      setSavedText(body);
      setPath(target);
      kernel.addRecent(target, 'lumen.slides');
    },
    [vfs, kernel, historyRef],
  );

  const saveAs = useCallback(async () => {
    const current = pathRef.current;
    const chosen = await pick({
      mode: 'save',
      title: 'Save As',
      defaultName: current ? basename(current) : DEFAULT_NAME,
      startDir: current ? dirname(current) : undefined,
    });
    const target = typeof chosen === 'string' ? chosen : null;
    if (!target) return false;
    try {
      await writeTo(target);
      return true;
    } catch (cause) {
      notify('Could not save', describe(cause));
      return false;
    }
  }, [pick, writeTo, notify, pathRef]);

  const save = useCallback(async () => {
    const target = pathRef.current;
    if (!target) return saveAs();
    try {
      await writeTo(target);
      return true;
    } catch (cause) {
      notify('Could not save', describe(cause));
      return false;
    }
  }, [saveAs, writeTo, notify, pathRef]);

  const confirmDiscard = useCallback(async () => {
    if (!dirtyRef.current) return true;
    const current = pathRef.current;
    const answer = await dialogs.choose({
      title: `Save changes to ${current ? basename(current) : 'Untitled'}?`,
      message: 'If you do not save, the changes are lost.',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'discard', label: "Don't Save", variant: 'secondary' },
        { id: 'save', label: 'Save' },
      ],
    });
    if (answer === 'save') return save();
    return answer === 'discard';
  }, [dialogs, save, dirtyRef, pathRef]);

  useCloseGuard(dirty ? confirmDiscard : null);

  const openFile = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await pick({ mode: 'open', title: 'Open Presentation', extensions: ['.lsl'] });
    const target = typeof chosen === 'string' ? chosen : (chosen?.[0] ?? null);
    if (target) await openPath(target);
  }, [confirmDiscard, pick, openPath]);

  const exportHtml = useCallback(async () => {
    const current = historyRef.current.present;
    const file = pathRef.current;
    const stem = file ? basename(file, true) : current.title || 'Untitled';
    const chosen = await pick({
      mode: 'save',
      title: 'Export as HTML',
      defaultName: `${stem}.html`,
      startDir: file ? dirname(file) : undefined,
      confirmLabel: 'Export',
    });
    const target = typeof chosen === 'string' ? chosen : null;
    if (!target) return;
    try {
      const images = await collectImages(vfs, current);
      await vfs.writeText(target, exportDeckHtml(current, images), { recursive: true });
      notify('Exported', basename(target));
    } catch (cause) {
      notify('Could not export', describe(cause));
    }
  }, [pick, vfs, notify, historyRef, pathRef]);

  // ── presenting ──────────────────────────────────────────────────────────

  const present = useCallback(() => {
    if (historyRef.current.present.slides.length === 0) return;
    setPresenting(true);
    controls.current.setFullscreen(true);
  }, [historyRef, controls]);

  const stopPresenting = useCallback(() => {
    setPresenting(false);
    controls.current.setFullscreen(false);
  }, [controls]);

  useShortcut('Mod+Enter', present, !presenting);

  // ── menus ───────────────────────────────────────────────────────────────

  const setPref = useCallback(
    (key: keyof SlidesPrefs) =>
      storePrefs((current) => {
        const value = normalizePrefs(current);
        return { ...value, [key]: !value[key] };
      }),
    [storePrefs],
  );

  const actions = useMemo<SlidesActions>(
    () => ({
      newDeck: () => launch('lumen.slides', {}),
      open: () => void openFile(),
      save: () => void save(),
      saveAs: () => void saveAs(),
      exportHtml: () => void exportHtml(),
      close: () => void controls.current.close(),
      undo: () => stepHistory('undo'),
      redo: () => stepHistory('redo'),
      renameDeck: () => void renameDeck(),
      newSlide: () => addSlide(),
      setLayout: (layout) => patchSlide({ layout }, false),
      duplicate: () => duplicateSlide(),
      remove: () => deleteSlide(),
      toggleNotes: () => setPref('notes'),
      toggleThumbnails: () => setPref('thumbnails'),
      present,
      help: () => launch('lumen.help', { section: 'slides' }),
    }),
    [
      launch,
      openFile,
      save,
      saveAs,
      exportHtml,
      controls,
      stepHistory,
      renameDeck,
      addSlide,
      patchSlide,
      duplicateSlide,
      deleteSlide,
      setPref,
      present,
    ],
  );

  const menuState = {
    hasSlides: deck.slides.length > 0,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    notesOpen: prefs.notes,
    thumbnailsOpen: prefs.thumbnails,
    layout: slide?.layout ?? null,
  };

  useAppMenus(buildSlidesMenus(menuState, actions), [
    actions,
    menuState.hasSlides,
    menuState.canUndo,
    menuState.canRedo,
    menuState.notesOpen,
    menuState.thumbnailsOpen,
    menuState.layout,
  ]);

  // ── render ──────────────────────────────────────────────────────────────

  const toolbar = (
    <Toolbar dense>
      <ToolbarGroup>
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => addSlide()}>
          New Slide
        </Button>
        <IconButton
          ref={layoutButton}
          label="Choose a layout"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={layoutMenu}
          onClick={() => setLayoutMenu((open) => !open)}
        >
          <ChevronDown />
        </IconButton>
      </ToolbarGroup>
      <Divider vertical className="mx-1 h-4" />
      <ToolbarGroup>
        <IconButton
          label="Duplicate slide"
          size="sm"
          disabled={!slide}
          onClick={() => duplicateSlide()}
        >
          <Copy />
        </IconButton>
        <IconButton label="Delete slide" size="sm" disabled={!slide} onClick={() => deleteSlide()}>
          <Trash2 />
        </IconButton>
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarGroup>
        <IconButton
          label={theme === 'dark' ? 'Use light slides' : 'Use dark slides'}
          size="sm"
          onClick={() => run({ type: 'setTheme', theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
        <IconButton
          label="Zoom to fit"
          size="sm"
          active={zoomFit}
          onClick={() => setZoomFit((on) => !on)}
        >
          <Scan />
        </IconButton>
        <IconButton
          label="Notes panel"
          size="sm"
          active={prefs.notes}
          onClick={() => setPref('notes')}
        >
          <PanelRight />
        </IconButton>
      </ToolbarGroup>
      <Divider vertical className="mx-1 h-4" />
      <Button
        size="sm"
        variant="primary"
        icon={<Play className="size-3.5" />}
        disabled={deck.slides.length === 0}
        onClick={present}
      >
        Present
      </Button>
    </Toolbar>
  );

  const statusBar = (
    <>
      <span className="truncate-1">{deck.title || 'Untitled'}</span>
      {slide && <span className="text-ink-3">{LAYOUT_LABELS[slide.layout]}</span>}
      <div className="flex-1" />
      {dirty && <span className="text-ink-3">Unsaved</span>}
      <span className="tabular-nums">
        {selected + 1} / {deck.slides.length}
      </span>
    </>
  );

  const canvas = loading ? (
    <div className="flex flex-1 items-center justify-center">
      <Spinner size={20} />
    </div>
  ) : error ? (
    <EmptyState
      icon={<FileWarning />}
      title="Could not open this presentation"
      description={error}
      action={
        <Button variant="primary" onClick={() => void openFile()}>
          Open another file
        </Button>
      }
    />
  ) : slide ? (
    <SlideCanvas
      key={slide.id}
      slide={slide}
      theme={theme}
      scale={scale}
      editable
      className="m-auto"
      onPatch={patchSlide}
      onChooseImage={() => void chooseImage()}
    />
  ) : (
    <EmptyState
      icon={<Presentation />}
      title="No slides"
      description="This presentation is empty."
      action={
        <Button variant="primary" onClick={() => addSlide('title')}>
          Add a slide
        </Button>
      }
    />
  );

  return (
    <div className="relative flex h-full w-full flex-col">
      <AppFrame
        toolbar={toolbar}
        statusBar={statusBar}
        sidebar={
          prefs.thumbnails ? (
            <SlideList
              deck={deck}
              theme={theme}
              selected={selected}
              onSelect={setSelected}
              onReorder={reorder}
              onDuplicate={duplicateSlide}
              onDelete={deleteSlide}
            />
          ) : null
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            ref={paneRef}
            className="lumen-scroll flex min-h-0 min-w-0 flex-1 bg-canvas p-6"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setLayoutMenu(false);
            }}
          >
            {canvas}
          </div>
          {prefs.notes && (
            <Inspector
              slide={slide}
              theme={theme}
              onNotes={(notes) => patchSlide({ notes })}
              onLayout={(layout) => patchSlide({ layout }, false)}
              onTheme={(next) => run({ type: 'setTheme', theme: next })}
              onChooseImage={() => void chooseImage()}
              onClose={() => setPref('notes')}
            />
          )}
        </div>
      </AppFrame>

      <AnchoredMenu
        open={layoutMenu}
        anchor={layoutButton.current}
        onClose={() => setLayoutMenu(false)}
        items={SLIDE_LAYOUTS.map((layout) => ({
          id: layout,
          label: LAYOUT_LABELS[layout],
          onSelect: () => addSlide(layout),
        }))}
      />

      {presenting && (
        <Presenter
          deck={deck}
          index={Math.min(selected, Math.max(0, deck.slides.length - 1))}
          onIndex={setSelected}
          onExit={stopPresenting}
        />
      )}
    </div>
  );
}

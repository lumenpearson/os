import { useKernel } from '@lumen/kernel/react';
import { AppFrame, Button, EmptyState, Spinner, useElementSize } from '@lumen/ui';
import { basename, dirname, join, typeInfo } from '@lumen/vfs';
import { FileWarning, FolderOpen, ImageOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useDirectory,
  useFilePicker,
  useJsonFile,
  useLauncher,
  useObjectUrl,
  useShortcut,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { Filmstrip } from './Filmstrip';
import { hasTransparency, isZoomable, type ViewerKind, viewerKind } from './kind';
import { buildPreviewMenus, type PreviewActions, type PreviewMenuState } from './menus';
import {
  hasStep,
  imageSiblings,
  positionLabel,
  previewableSiblings,
  stepIndex,
} from './navigation';
import { DEFAULT_PREFS, normalizePrefs, type PreviewPrefs } from './prefs';
import { PreviewStatusBar } from './StatusBar';
import { PreviewToolbar } from './Toolbar';
import { usePreviewFile } from './usePreviewFile';
import { CsvView } from './viewers/CsvView';
import { HexView } from './viewers/HexView';
import { ImageStage } from './viewers/ImageStage';
import { JsonView } from './viewers/JsonView';
import { MediaView } from './viewers/MediaView';
import { PdfView } from './viewers/PdfView';
import { SvgView } from './viewers/SvgView';
import { TextView } from './viewers/TextView';
import { UnsupportedView } from './viewers/UnsupportedView';
import {
  actualView,
  applyZoom,
  fitView,
  flip,
  INITIAL_VIEW,
  rotateBy,
  type Size,
  type View,
  viewportCentre,
  zoomIn,
  zoomOut,
} from './zoom';

/** Viewers that draw the file itself rather than its characters. */
const NEEDS_URL: ReadonlySet<ViewerKind> = new Set<ViewerKind>([
  'image',
  'svg',
  'pdf',
  'audio',
  'video',
]);

/** Under this width the toolbar and status bar drop their second rank. */
const NARROW_WIDTH = 520;

function firstPath(args: Record<string, unknown>): string | null {
  if (typeof args.path === 'string') return args.path;
  const list = args.paths;
  if (Array.isArray(list) && typeof list[0] === 'string') return list[0];
  return null;
}

/**
 * The viewer window: one file on the stage, the previewable files around it
 * in the same folder as the sequence the arrows walk. Which viewer draws it
 * is decided in `kind.ts`; the geometry lives in `zoom.ts`.
 */
export default function Preview(props: AppProps) {
  const args = useArgs(props.args);
  const kernel = useKernel();
  const pick = useFilePicker();
  const { launch } = useLauncher();
  const { window: frameWindow, setFullscreen, setDocument, close } = useWindowControls();

  const launched = firstPath(args);
  const [path, setPath] = useState<string | null>(launched);
  useEffect(() => {
    if (launched) setPath(launched);
  }, [launched]);

  const file = usePreviewFile(path);
  const urlPath = path !== null && NEEDS_URL.has(viewerKind(path)) ? path : null;
  const blob = useObjectUrl(urlPath);

  const [stored, storePrefs] = useJsonFile<PreviewPrefs>(
    join(kernel.home, '.config', 'preview.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalizePrefs(stored), [stored]);

  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [content, setContent] = useState<Size | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [undrawable, setUndrawable] = useState(false);

  const [frame, frameSize] = useElementSize<HTMLDivElement>();
  const [stage, stageSize] = useElementSize<HTMLDivElement>();
  const narrow = frameSize.width > 0 && frameSize.width < NARROW_WIDTH;
  const fullScreen = frameWindow?.fullscreen ?? false;

  const name = path === null ? 'Preview' : basename(path);
  useTitle(name);
  useEffect(() => {
    setDocument(path);
  }, [path, setDocument]);

  // A different file starts from a fresh view; nothing about the last one
  // (its zoom, its size, its source pane) means anything here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new path is the reason to reset, not something the body reads
  useEffect(() => {
    setView(INITIAL_VIEW);
    setContent(null);
    setDuration(null);
    setShowSource(false);
    setUndrawable(false);
  }, [path]);

  // ── the folder around the file ──────────────────────────────────────────

  const dir = useDirectory(path === null ? null : dirname(path));
  const place = useMemo(() => previewableSiblings(dir.entries, path), [dir.entries, path]);
  const strip = useMemo(() => imageSiblings(place.items), [place.items]);

  const step = useCallback(
    (delta: number) => {
      const next = stepIndex(place.index, place.items.length, delta);
      if (next === null) return;
      const target = place.items[next];
      if (target) setPath(target);
    },
    [place],
  );

  const reveal = useCallback(() => {
    if (path !== null) launch('lumen.files', { path });
  }, [launch, path]);

  const openFile = useCallback(async () => {
    const chosen = await pick({ mode: 'open', title: 'Open' });
    const next = typeof chosen === 'string' ? chosen : (chosen?.[0] ?? null);
    if (next === null) return;
    setPath(next);
    kernel.addRecent(next, 'lumen.preview');
  }, [pick, kernel]);

  // ── the view on the picture ─────────────────────────────────────────────

  const rescale = useCallback(
    (next: (scale: number) => number) => {
      if (!content) return;
      setView((current) =>
        applyZoom(current, next(current.scale), viewportCentre(stageSize), content, stageSize),
      );
    },
    [content, stageSize],
  );

  const rotate = useCallback(
    (degrees: number) => {
      if (!content) return;
      setView((current) => rotateBy(current, degrees, content, stageSize));
    },
    [content, stageSize],
  );

  const fitToWindow = useCallback(() => {
    if (!content) return;
    setView((current) => fitView(current, content, stageSize));
  }, [content, stageSize]);

  const toggleFilmstrip = useCallback(() => {
    storePrefs((current) => ({
      ...normalizePrefs(current),
      filmstrip: !normalizePrefs(current).filmstrip,
    }));
  }, [storePrefs]);

  // ── menus and keys ──────────────────────────────────────────────────────

  const zoomable = isZoomable(file.kind) && !showSource && content !== null;
  const hasSource = file.kind === 'svg' && file.text !== null;
  const canFilmstrip = strip.length > 1 && (file.kind === 'image' || file.kind === 'svg');

  const actions = useMemo<PreviewActions>(
    () => ({
      open: () => void openFile(),
      reveal,
      previous: () => step(-1),
      next: () => step(1),
      close: () => void close(),
      zoomIn: () => rescale(zoomIn),
      zoomOut: () => rescale(zoomOut),
      actualSize: () => setView(actualView),
      fitToWindow,
      rotateLeft: () => rotate(-90),
      rotateRight: () => rotate(90),
      flipHorizontal: () => setView((current) => flip(current, 'x')),
      flipVertical: () => setView((current) => flip(current, 'y')),
      toggleFullScreen: () => setFullscreen(!fullScreen),
      toggleFilmstrip,
      toggleSource: () => setShowSource((on) => !on),
    }),
    [
      openFile,
      reveal,
      step,
      close,
      rescale,
      fitToWindow,
      rotate,
      setFullscreen,
      fullScreen,
      toggleFilmstrip,
    ],
  );

  const menuState: PreviewMenuState = {
    hasFile: path !== null && file.error === null,
    zoomable,
    hasPrevious: hasStep(place, -1),
    hasNext: hasStep(place, 1),
    hasSource,
    showingSource: showSource,
    canFilmstrip,
    filmstrip: prefs.filmstrip,
    fullScreen,
  };

  useAppMenus(buildPreviewMenus(menuState, actions), [
    actions,
    menuState.hasFile,
    menuState.zoomable,
    menuState.hasPrevious,
    menuState.hasNext,
    menuState.hasSource,
    menuState.showingSource,
    menuState.canFilmstrip,
    menuState.filmstrip,
    menuState.fullScreen,
  ]);

  useShortcut('Escape', () => setFullscreen(false), fullScreen);
  // Bare arrows walk the folder where nothing else wants them: a picture that
  // overflows its window handles them first, to pan.
  const stepKeys = file.kind === 'image' || (file.kind === 'svg' && !showSource);
  useShortcut('Left', () => step(-1), stepKeys);
  useShortcut('Right', () => step(1), stepKeys);

  // ── render ──────────────────────────────────────────────────────────────

  const failure = file.error ?? blob.error;
  const showFilmstrip = prefs.filmstrip && canFilmstrip && !fullScreen;

  function viewer() {
    if (path === null)
      return (
        <EmptyState
          icon={<ImageOff />}
          title="No file open"
          description="Open a picture, a PDF, a media file or a data file to look at it."
          action={
            <Button variant="primary" onClick={() => void openFile()}>
              Open…
            </Button>
          }
        />
      );
    if (failure !== null)
      return (
        <EmptyState
          icon={<FileWarning />}
          title="Could not open this file"
          description={failure}
          action={
            <Button variant="primary" onClick={() => void openFile()}>
              Open another file
            </Button>
          }
        />
      );
    if (file.loading || (urlPath !== null && blob.loading))
      return (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      );
    if (undrawable)
      return (
        <EmptyState
          icon={<ImageOff />}
          title="Could not draw this picture"
          description={`${typeInfo(path).label} — the file may be damaged or use a variant this runtime cannot decode.`}
          action={
            <Button icon={<FolderOpen />} onClick={reveal}>
              Reveal in Files
            </Button>
          }
        />
      );

    const url = blob.url;
    if (NEEDS_URL.has(file.kind) && url === null)
      return (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      );

    switch (file.kind) {
      case 'image':
        return (
          <ImageStage
            url={url ?? ''}
            name={name}
            view={view}
            onViewChange={setView}
            content={content}
            onContentSize={setContent}
            onError={() => setUndrawable(true)}
            checkered={hasTransparency(path)}
          />
        );
      case 'svg':
        return (
          <SvgView
            url={url ?? ''}
            source={file.text}
            showSource={showSource}
            name={name}
            view={view}
            onViewChange={setView}
            content={content}
            onContentSize={setContent}
            onError={() => setUndrawable(true)}
          />
        );
      case 'pdf':
        return <PdfView url={url ?? ''} name={name} onReveal={reveal} />;
      case 'audio':
      case 'video':
        return (
          <MediaView
            url={url ?? ''}
            name={name}
            video={file.kind === 'video'}
            narrow={narrow}
            fullScreen={fullScreen}
            onToggleFullScreen={() => setFullscreen(!fullScreen)}
            onDuration={(seconds) => setDuration(Number.isFinite(seconds) ? seconds : null)}
            onSize={setContent}
          />
        );
      case 'markdown':
      case 'text':
        return (
          <TextView
            text={file.text ?? ''}
            markdown={file.kind === 'markdown'}
            dropped={file.dropped}
            name={name}
          />
        );
      case 'json':
        return <JsonView text={file.text ?? ''} name={name} dropped={file.dropped} />;
      case 'csv':
        return <CsvView text={file.text ?? ''} name={name} />;
      case 'hex':
        return file.bytes === null ? null : (
          <HexView bytes={file.bytes} name={name} dropped={file.dropped} />
        );
      default:
        return <UnsupportedView path={path} size={file.stat?.size ?? null} onReveal={reveal} />;
    }
  }

  return (
    <AppFrame
      toolbar={
        fullScreen ? undefined : (
          <PreviewToolbar
            position={positionLabel(place.index, place.items.length)}
            hasPrevious={menuState.hasPrevious}
            hasNext={menuState.hasNext}
            zoomable={zoomable}
            scale={view.scale}
            fit={view.fit}
            hasSource={hasSource}
            showingSource={showSource}
            canFilmstrip={canFilmstrip}
            filmstrip={prefs.filmstrip}
            fullScreen={fullScreen}
            hasFile={menuState.hasFile}
            narrow={narrow}
            onPrevious={actions.previous}
            onNext={actions.next}
            onZoomIn={actions.zoomIn}
            onZoomOut={actions.zoomOut}
            onFit={actions.fitToWindow}
            onActualSize={actions.actualSize}
            onRotateLeft={actions.rotateLeft}
            onRotateRight={actions.rotateRight}
            onToggleSource={actions.toggleSource}
            onToggleFilmstrip={actions.toggleFilmstrip}
            onToggleFullScreen={actions.toggleFullScreen}
            onReveal={actions.reveal}
          />
        )
      }
      statusBar={
        fullScreen || path === null ? undefined : (
          <PreviewStatusBar
            name={name}
            typeLabel={typeInfo(path).label}
            size={file.stat?.size ?? null}
            dimensions={content}
            duration={duration}
            modifiedAt={file.stat?.modifiedAt ?? null}
            narrow={narrow}
          />
        )
      }
    >
      <div ref={frame} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={stage} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {viewer()}
        </div>
        {showFilmstrip && <Filmstrip items={strip} selected={path} onSelect={setPath} />}
      </div>
    </AppFrame>
  );
}

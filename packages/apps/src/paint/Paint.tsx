/**
 * Paint: a bitmap editor.
 *
 * The document is a single `<canvas>` held in a ref and handed to the surface
 * to draw on. It deliberately is not React state — re-creating the element
 * would throw the picture away — so what React tracks is everything *about*
 * the document: its size, whether it has been saved, and a revision counter
 * that says the pixels moved.
 *
 * Undo is whole-image snapshots rather than inverse commands. A snapshot
 * cannot be subtly wrong; it can only be big, and `history.ts` caps the stack
 * by both depth and bytes. One snapshot is pushed per finished gesture, never
 * per pointer move.
 */

import { useIsFocused, useKernel, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  IconButton,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { dirname, join } from '@lumen/vfs';
import { Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useArgs,
  useCloseGuard,
  useDirty,
  useFilePicker,
  useJsonFile,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { parseHex, pushRecent } from './colour';
import {
  type Anchor,
  anchorOffset,
  clampSize,
  documentTitle,
  formatSize,
  isPng,
  pixelBytes,
  pngPath,
  rotatedSize,
  sameSize,
} from './document';
import type { Point, Rect, Size } from './geometry';
import {
  canRedo,
  canUndo,
  createHistory,
  type History,
  push as pushHistory,
  redo as redoHistory,
  undo as undoHistory,
} from './history';
import { buildPaintMenus } from './menus';
import { DEFAULT_PREFS, normalizePrefs, type PaintPrefs } from './prefs';
import { ResizeDialog, type ResizeMode } from './ResizeDialog';
import { clear as clearSurface, context, createSurface, fill, paintText } from './raster';
import { Surface } from './Surface';
import { ColourWell, ToolOptions, ToolPalette } from './ToolPalette';
import { isToolId, type ToolId, toolForKey } from './tools';
import {
  clampScale,
  fitView,
  shouldShowGrid,
  type View,
  viewportCentre,
  zoomPercent,
  zoomStepIn,
  zoomStepOut,
  zoomTo,
} from './transform';

/** Depth and byte budget for the undo stack; a snapshot is width × height × 4. */
const LIMITS = { depth: 32, maxBytes: 192 * 1024 * 1024, sizeOf: sizeOfSnapshot };

type Snapshot = ImageData | null;

/**
 * The narrowest window that still fits the colour well, the tool options and
 * the zoom controls on one row. Below it the options take a row of their own
 * rather than being squeezed out of reach.
 */
const OPTIONS_INLINE_WIDTH = 640;

/**
 * The face the text tool draws with. The document is a bitmap, so this is
 * baked into pixels the moment it is placed — it is the interface font by
 * name rather than by token, because a canvas cannot read a CSS variable.
 */
const TEXT_FONT = '"IBM Plex Sans", system-ui, sans-serif';

function sizeOfSnapshot(snapshot: Snapshot): number {
  return snapshot ? snapshot.data.length : 0;
}

export default function Paint(_props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const dialogs = useDialogs();
  const pick = useFilePicker();
  const notify = useNotify();
  const { container, windowId } = useApp();
  const { close } = useWindowControls();
  const args = useArgs<{ path?: string }>({});
  const focused = useIsFocused(windowId);

  const [prefsFile, setPrefsFile] = useJsonFile(
    join(kernel.home, '.config', 'paint.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalizePrefs(prefsFile), [prefsFile]);

  const doc = useRef<HTMLCanvasElement | null>(null);
  if (doc.current === null && typeof document !== 'undefined') {
    doc.current = createSurface(prefs.canvas);
    const ctx = context(doc.current);
    if (ctx)
      fill(ctx, prefs.canvas, parseHex(prefs.background) ?? { r: 255, g: 255, b: 255, a: 255 });
  }

  const [size, setSize] = useState<Size>(() => clampSize(prefs.canvas));
  const [revision, setRevision] = useState(0);
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [history, setHistory] = useState<History<Snapshot>>(() => createHistory<Snapshot>(null));
  const [resize, setResize] = useState<ResizeMode | null>(null);
  const clipboard = useRef<HTMLCanvasElement | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>();
  const [frameRef, frame] = useElementSize<HTMLDivElement>();

  useTitle(`Paint — ${documentTitle(path, dirty)}`);
  useDirty(dirty);

  const snapshot = useCallback((): Snapshot => {
    const ctx = context(doc.current);
    if (!ctx || size.width <= 0 || size.height <= 0) return null;
    return ctx.getImageData(0, 0, size.width, size.height);
  }, [size.height, size.width]);

  const restore = useCallback((entry: Snapshot, to: Size) => {
    const canvas = doc.current;
    if (!canvas) return;
    if (canvas.width !== to.width || canvas.height !== to.height) {
      canvas.width = to.width;
      canvas.height = to.height;
    }
    const ctx = context(canvas);
    if (!ctx) return;
    clearSurface(ctx, to);
    if (entry) ctx.putImageData(entry, 0, 0);
  }, []);

  /** One finished gesture: snapshot the result and mark the file changed. */
  const commit = useCallback(() => {
    setHistory((current) => pushHistory(current, snapshot(), LIMITS));
    setRevision((n) => n + 1);
    setDirty(true);
  }, [snapshot]);

  /** Reset the stack around whatever is on the canvas now (new, or opened). */
  const rebase = useCallback(() => {
    setHistory(createHistory<Snapshot>(snapshot()));
    setRevision((n) => n + 1);
  }, [snapshot]);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!canUndo(current)) return current;
      const next = undoHistory(current);
      const entry = next.present;
      const to = entry ? { width: entry.width, height: entry.height } : size;
      restore(entry, to);
      setSize(to);
      setRevision((n) => n + 1);
      setDirty(true);
      return next;
    });
  }, [restore, size]);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (!canRedo(current)) return current;
      const next = redoHistory(current);
      const entry = next.present;
      const to = entry ? { width: entry.width, height: entry.height } : size;
      restore(entry, to);
      setSize(to);
      setRevision((n) => n + 1);
      setDirty(true);
      return next;
    });
  }, [restore, size]);

  /**
   * Redraw the document at a new size through a caller-supplied transform.
   * The old pixels are copied to scratch first, because setting a canvas's
   * width clears it.
   */
  const reraster = useCallback(
    (to: Size, draw: (ctx: CanvasRenderingContext2D, from: HTMLCanvasElement) => void) => {
      const canvas = doc.current;
      if (!canvas) return;
      const scratch = createSurface({ width: canvas.width, height: canvas.height });
      context(scratch)?.drawImage(canvas, 0, 0);
      canvas.width = to.width;
      canvas.height = to.height;
      const ctx = context(canvas);
      if (ctx) draw(ctx, scratch);
      setSize(to);
      setSelection(null);
      commit();
    },
    [commit],
  );

  const setPrefs = useCallback(
    (patch: Partial<PaintPrefs>) => {
      setPrefsFile((current) => ({ ...normalizePrefs(current), ...patch }));
    },
    [setPrefsFile],
  );

  const useColour = useCallback(
    (hex: string) => {
      setPrefsFile((current) => {
        const base = normalizePrefs(current);
        return { ...base, foreground: hex, recent: pushRecent(base.recent, hex) };
      });
    },
    [setPrefsFile],
  );

  // ── the file ───────────────────────────────────────────────────────────

  const loadFrom = useCallback(
    async (from: string) => {
      const url = await vfs.objectUrl(from);
      try {
        const image = await loadImage(url);
        const to = clampSize({ width: image.width, height: image.height });
        const canvas = doc.current;
        if (!canvas) return;
        canvas.width = to.width;
        canvas.height = to.height;
        context(canvas)?.drawImage(image, 0, 0);
        setSize(to);
        setSelection(null);
        setPath(from);
        setDirty(false);
        rebase();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [rebase, vfs],
  );

  const writeTo = useCallback(
    async (to: string) => {
      const canvas = doc.current;
      const bytes = canvas ? await encodePng(canvas) : null;
      if (!bytes) {
        notify('Could not save', 'This build cannot encode a PNG.');
        return;
      }
      await vfs.writeFile(to, bytes, { recursive: true });
      setPath(to);
      setDirty(false);
    },
    [notify, vfs],
  );

  const newDocument = useCallback(async () => {
    if (
      dirty &&
      !(await dialogs.confirm({
        title: 'Discard the changes to this picture?',
        message: 'It has not been saved.',
        confirmLabel: 'Discard',
        danger: true,
      }))
    ) {
      return;
    }
    const to = clampSize(prefs.canvas);
    const canvas = doc.current;
    if (canvas) {
      canvas.width = to.width;
      canvas.height = to.height;
      const ctx = context(canvas);
      if (ctx) fill(ctx, to, parseHex(prefs.background) ?? { r: 255, g: 255, b: 255, a: 255 });
    }
    setSize(to);
    setSelection(null);
    setPath(null);
    setDirty(false);
    rebase();
  }, [dialogs, dirty, prefs.background, prefs.canvas, rebase]);

  const open = useCallback(async () => {
    const chosen = await pick({
      mode: 'open',
      title: 'Open a picture',
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
    });
    const from = Array.isArray(chosen) ? chosen[0] : chosen;
    if (typeof from === 'string') await loadFrom(from);
  }, [loadFrom, pick]);

  const saveAs = useCallback(async () => {
    const chosen = await pick({
      mode: 'save',
      title: 'Save the picture',
      startDir: path ? dirname(path) : join(kernel.home, 'Pictures'),
      defaultName: path ? pngPath(path).split('/').pop() : 'untitled.png',
      extensions: ['.png'],
    });
    const to = Array.isArray(chosen) ? chosen[0] : chosen;
    if (typeof to === 'string') await writeTo(pngPath(to));
  }, [kernel.home, path, pick, writeTo]);

  const save = useCallback(async () => {
    if (path && isPng(path)) await writeTo(path);
    else await saveAs();
  }, [path, saveAs, writeTo]);

  // ── the selection ──────────────────────────────────────────────────────

  const lift = useCallback((rect: Rect): HTMLCanvasElement | null => {
    const canvas = doc.current;
    if (!canvas) return null;
    const cut = createSurface({ width: rect.width, height: rect.height });
    const ctx = context(cut);
    if (!ctx) return null;
    ctx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    return cut;
  }, []);

  const copy = useCallback(() => {
    if (!selection) return;
    clipboard.current = lift(selection);
    setHasClipboard(clipboard.current !== null);
  }, [lift, selection]);

  const cut = useCallback(() => {
    if (!selection) return;
    copy();
    const ctx = context(doc.current);
    if (ctx) ctx.clearRect(selection.x, selection.y, selection.width, selection.height);
    setSelection(null);
    commit();
  }, [commit, copy, selection]);

  const paste = useCallback(() => {
    const held = clipboard.current;
    const ctx = context(doc.current);
    if (!held || !ctx) return;
    // Into the top-left of the selection when there is one, otherwise the
    // corner of the picture — never somewhere the pointer happened to be.
    const at = selection ?? { x: 0, y: 0, width: held.width, height: held.height };
    ctx.drawImage(held, at.x, at.y);
    setSelection({ x: at.x, y: at.y, width: held.width, height: held.height });
    commit();
  }, [commit, selection]);

  const crop = useCallback(() => {
    if (!selection) return;
    const rect = selection;
    reraster({ width: rect.width, height: rect.height }, (ctx, from) => {
      ctx.drawImage(from, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    });
  }, [reraster, selection]);

  // ── the image ──────────────────────────────────────────────────────────

  const flip = useCallback(
    (axis: 'x' | 'y') => {
      reraster(size, (ctx, from) => {
        ctx.save();
        ctx.translate(axis === 'x' ? size.width : 0, axis === 'y' ? size.height : 0);
        ctx.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1);
        ctx.drawImage(from, 0, 0);
        ctx.restore();
      });
    },
    [reraster, size],
  );

  const rotate = useCallback(
    (quarterTurns: 1 | -1) => {
      const to = rotatedSize(size, quarterTurns);
      reraster(to, (ctx, from) => {
        ctx.save();
        ctx.translate(to.width / 2, to.height / 2);
        ctx.rotate((quarterTurns * Math.PI) / 2);
        ctx.drawImage(from, -size.width / 2, -size.height / 2);
        ctx.restore();
      });
    },
    [reraster, size],
  );

  const applyResize = useCallback(
    (to: Size, anchor: Anchor, mode: ResizeMode) => {
      setResize(null);
      if (sameSize(to, size)) return;
      if (mode === 'scale') {
        reraster(to, (ctx, from) => {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(from, 0, 0, to.width, to.height);
        });
        return;
      }
      const offset = anchorOffset(anchor, size, to);
      reraster(to, (ctx, from) => {
        ctx.drawImage(from, offset.x, offset.y);
      });
    },
    [reraster, size],
  );

  // ── the view ───────────────────────────────────────────────────────────

  const zoom = useCallback(
    (scale: number) => {
      setView((current) =>
        zoomTo(current, clampScale(scale), viewportCentre(viewport), size, viewport),
      );
    },
    [size, viewport],
  );

  const fit = useCallback(() => {
    if (viewport.width > 0 && viewport.height > 0) setView(fitView(size, viewport));
  }, [size, viewport]);

  // The first real measurement is what decides where the picture sits; after
  // that the user owns the view and it is left alone.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || viewport.width === 0) return;
    settled.current = true;
    setView(fitView(size, viewport));
  }, [size, viewport]);

  // ── text ───────────────────────────────────────────────────────────────

  const placeText = useCallback(
    async (at: Point) => {
      const text = await dialogs.prompt({ title: 'Text', placeholder: 'Type the text' });
      const ctx = context(doc.current);
      if (!text || !ctx) return;
      paintText(ctx, text, at, {
        size: prefs.textSize,
        colour: parseHex(prefs.foreground) ?? { r: 0, g: 0, b: 0, a: 255 },
        family: TEXT_FONT,
      });
      commit();
    },
    [commit, dialogs, prefs.foreground, prefs.textSize],
  );

  // ── wiring ─────────────────────────────────────────────────────────────

  useCloseGuard(
    useCallback(async () => {
      if (!dirty) return true;
      const answer = await dialogs.choose({
        title: 'Save this picture before closing?',
        buttons: [
          { id: 'discard', label: "Don't Save", variant: 'danger' },
          { id: 'cancel', label: 'Cancel', variant: 'secondary' },
          { id: 'save', label: 'Save', variant: 'primary' },
        ],
      });
      if (answer === 'save') {
        await save();
        return true;
      }
      return answer === 'discard';
    }, [dialogs, dirty, save]),
  );

  const latest = useLatest({
    newDocument,
    open,
    save,
    saveAs,
    undo,
    redo,
    cut,
    copy,
    paste,
    crop,
    close,
    flip,
    rotate,
    zoom,
    fit,
    selectAll: () => setSelection({ x: 0, y: 0, ...size }),
    deselect: () => setSelection(null),
    setResize,
    setTool: (tool: ToolId) => setPrefs({ tool }),
    toggleGrid: () => setPrefs({ showGrid: !prefs.showGrid }),
  });

  useAppMenus(
    buildPaintMenus(
      {
        canUndo: canUndo(history),
        canRedo: canRedo(history),
        hasSelection: selection !== null,
        hasClipboard,
        showGrid: prefs.showGrid,
        gridAvailable: shouldShowGrid(view.scale),
      },
      {
        newDocument: () => void latest.current.newDocument(),
        open: () => void latest.current.open(),
        save: () => void latest.current.save(),
        saveAs: () => void latest.current.saveAs(),
        exportPng: () => void latest.current.saveAs(),
        undo: () => latest.current.undo(),
        redo: () => latest.current.redo(),
        cut: () => latest.current.cut(),
        copy: () => latest.current.copy(),
        paste: () => latest.current.paste(),
        selectAll: () => latest.current.selectAll(),
        deselect: () => latest.current.deselect(),
        crop: () => latest.current.crop(),
        canvasSize: () => latest.current.setResize('canvas'),
        scaleImage: () => latest.current.setResize('scale'),
        flipHorizontal: () => latest.current.flip('x'),
        flipVertical: () => latest.current.flip('y'),
        rotateLeft: () => latest.current.rotate(-1),
        rotateRight: () => latest.current.rotate(1),
        zoomIn: () => latest.current.zoom(zoomStepIn(view.scale)),
        zoomOut: () => latest.current.zoom(zoomStepOut(view.scale)),
        actualSize: () => latest.current.zoom(1),
        fitToWindow: () => latest.current.fit(),
        toggleGrid: () => latest.current.toggleGrid(),
      },
    ),
    [history, selection !== null, hasClipboard, prefs.showGrid, view.scale, close],
  );

  // A launch argument opens that file, which is what Files does on a
  // double-click. It runs once per path, not once per render.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const wanted = args.path;
    if (!wanted || opened.current === wanted) return;
    opened.current = wanted;
    void loadFrom(wanted);
  }, [args.path, loadFrom]);

  /**
   * One letter chooses a tool, the way every image editor works. It listens on
   * the window rather than on a container, because the canvas is a div and not
   * a focus stop — but only while this window is the focused one, and never
   * over a field, where the letter is text the user is typing.
   */
  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const next = toolForKey(event.key);
      if (!next) return;
      event.preventDefault();
      setPrefs({ tool: next });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, setPrefs]);

  const tool = isToolId(prefs.tool) ? prefs.tool : DEFAULT_PREFS.tool;
  // Below this the colour well, the tool options and the zoom controls cannot
  // share one row, so the options take a row of their own. Width 0 is the
  // frame before its first measurement: assume there is room.
  const stackOptions = frame.width > 0 && frame.width < OPTIONS_INLINE_WIDTH;

  return (
    <div ref={frameRef} className="flex h-full min-h-0 w-full flex-col">
      <AppFrame
        toolbar={
          <>
            <Toolbar dense>
              <ColourWell
                foreground={prefs.foreground}
                background={prefs.background}
                recent={prefs.recent}
                onForeground={useColour}
                onBackground={(background) => setPrefs({ background })}
                onSwap={() =>
                  setPrefs({ foreground: prefs.background, background: prefs.foreground })
                }
              />
              <span aria-hidden className="h-4 w-px shrink-0 bg-rule" />
              {!stackOptions && <ToolOptions tool={tool} prefs={prefs} onPrefs={setPrefs} />}
              <ToolbarSpacer />
              <IconButton
                size="sm"
                label="Undo"
                disabled={!canUndo(history)}
                onClick={() => undo()}
              >
                <Undo2 className="size-3.5" />
              </IconButton>
              <IconButton
                size="sm"
                label="Redo"
                disabled={!canRedo(history)}
                onClick={() => redo()}
              >
                <Redo2 className="size-3.5" />
              </IconButton>
              <IconButton size="sm" label="Zoom out" onClick={() => zoom(zoomStepOut(view.scale))}>
                <ZoomOut className="size-3.5" />
              </IconButton>
              <Button size="sm" variant="ghost" className="mono tabular-nums" onClick={fit}>
                {zoomPercent(view.scale)}%
              </Button>
              <IconButton size="sm" label="Zoom in" onClick={() => zoom(zoomStepIn(view.scale))}>
                <ZoomIn className="size-3.5" />
              </IconButton>
            </Toolbar>
            {stackOptions && (
              <Toolbar dense>
                <ToolOptions tool={tool} prefs={prefs} onPrefs={setPrefs} />
              </Toolbar>
            )}
          </>
        }
        sidebar={<ToolPalette tool={tool} onTool={(next) => setPrefs({ tool: next })} />}
        statusBar={
          <>
            <span className="tabular-nums">{formatSize(size)}</span>
            <span className="tabular-nums text-ink-3">{formatBytes(pixelBytes(size))}</span>
            {selection && (
              <span className="tabular-nums">
                Selection {formatSize({ width: selection.width, height: selection.height })}
              </span>
            )}
          </>
        }
      >
        <div ref={viewportRef} className="flex min-h-0 min-w-0 flex-1">
          <Surface
            document={doc.current}
            size={size}
            view={view}
            viewport={viewport}
            tool={tool}
            prefs={prefs}
            selection={selection}
            revision={revision}
            onView={setView}
            onSelection={setSelection}
            onCommit={commit}
            onPickColour={useColour}
            onPlaceText={(at) => void placeText(at)}
          />
        </div>
      </AppFrame>

      <ResizeDialog
        open={resize !== null}
        mode={resize ?? 'canvas'}
        size={size}
        container={container}
        onApply={(to, anchor) => applyResize(to, anchor, resize ?? 'canvas')}
        onClose={() => setResize(null)}
      />
    </div>
  );
}

/** An image element that has finished loading, or a rejection. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('the file is not an image this build can read'));
    image.src = url;
  });
}

/** The canvas as PNG bytes, or null where the platform cannot encode one. */
async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  if (typeof canvas.toBlob !== 'function') return null;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

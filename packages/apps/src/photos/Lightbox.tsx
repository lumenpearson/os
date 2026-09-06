import {
  cx,
  EmptyState,
  IconButton,
  Spinner,
  Toolbar,
  ToolbarGroup,
  useElementSize,
} from '@lumen/ui';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  Info,
  Scan,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useObjectUrl } from '../_sdk';
import { hasTransparency } from '../preview/kind';
import { ImageStage } from '../preview/viewers/ImageStage';
import {
  actualView,
  applyZoom,
  fitView,
  INITIAL_VIEW,
  type Size,
  type View,
  viewportCentre,
  zoomIn,
  zoomOut,
  zoomPercent,
} from '../preview/zoom';
import { InfoPanel } from './InfoPanel';
import { type Photo, positionLabel } from './library';

export interface LightboxProps {
  photo: Photo;
  index: number;
  total: number;
  favourite: boolean;
  info: boolean;
  /** Room for the toolbar's second rank, and for the facts panel. */
  wide: boolean;
  onClose: () => void;
  onStep: (delta: number) => void;
  onToggleFavourite: () => void;
  onToggleInfo: () => void;
  /** The measured pixels of the decoded picture, for the facts panel. */
  onDimensions: (size: Size) => void;
}

/**
 * One picture filling the window. The stage, the geometry and the pointer
 * handling are Preview's — the same drag, the same zoom towards the cursor,
 * the same transform written to the DOM inside a frame — because a picture
 * should behave the same everywhere in the OS.
 *
 * The zoom reading says what the scale actually is: "Fit" while the picture
 * follows the window, and the percentage the moment it stops.
 */
export function Lightbox({
  photo,
  index,
  total,
  favourite,
  info,
  wide,
  onClose,
  onStep,
  onToggleFavourite,
  onToggleInfo,
  onDimensions,
}: LightboxProps) {
  const { url, loading, error } = useObjectUrl(photo.path);
  const [stage, stageSize] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [content, setContent] = useState<Size | null>(null);
  const [undrawable, setUndrawable] = useState(false);

  // A different picture starts from a fresh view; the last one's zoom means
  // nothing about this one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new path is the reason to reset
  useEffect(() => {
    setView(INITIAL_VIEW);
    setContent(null);
    setUndrawable(false);
  }, [photo.path]);

  const onContentSize = useCallback(
    (size: Size) => {
      setContent(size);
      onDimensions(size);
    },
    [onDimensions],
  );

  const rescale = useCallback(
    (next: (scale: number) => number) => {
      if (!content) return;
      setView((current) =>
        applyZoom(current, next(current.scale), viewportCentre(stageSize), content, stageSize),
      );
    },
    [content, stageSize],
  );

  const fit = useCallback(() => {
    if (!content) return;
    setView((current) => fitView(current, content, stageSize));
  }, [content, stageSize]);

  const zoomable = content !== null && !undrawable;
  const position = positionLabel(index, total);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface text-ink">
      <Toolbar dense windowControls className="gap-2">
        <IconButton label="Back to Library" onClick={onClose}>
          <ArrowLeft />
        </IconButton>
        <span className="truncate-1 min-w-0 flex-1 text-base text-ink">{photo.name}</span>
        {position && (
          <span className="mono shrink-0 text-xs tabular-nums text-ink-3">{position}</span>
        )}

        {/* In a narrow window the arrows and the menubar are how the library
            is walked; the zoom has nowhere else to live, so it stays. */}
        {wide && (
          <ToolbarGroup>
            <IconButton label="Previous" disabled={index <= 0} onClick={() => onStep(-1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton
              label="Next"
              disabled={index < 0 || index >= total - 1}
              onClick={() => onStep(1)}
            >
              <ChevronRight />
            </IconButton>
          </ToolbarGroup>
        )}

        {zoomable && (
          <ToolbarGroup>
            <IconButton label="Zoom Out" onClick={() => rescale(zoomOut)}>
              <ZoomOut />
            </IconButton>
            {wide && (
              <button
                type="button"
                onClick={() => setView(actualView)}
                title="Actual Size"
                className={cx(
                  'mono h-7 min-w-13 rounded-sm px-1 text-xs tabular-nums text-ink-2 lumen-focus',
                  'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2 hover:text-ink',
                )}
              >
                {view.fit ? 'Fit' : `${zoomPercent(view.scale)}%`}
              </button>
            )}
            <IconButton label="Zoom In" onClick={() => rescale(zoomIn)}>
              <ZoomIn />
            </IconButton>
            <IconButton label="Fit to Window" active={view.fit} onClick={fit}>
              <Scan />
            </IconButton>
          </ToolbarGroup>
        )}

        <ToolbarGroup>
          <IconButton label="Favourite" active={favourite} onClick={onToggleFavourite}>
            <Heart className={favourite ? 'fill-current text-accent' : undefined} />
          </IconButton>
          {wide && (
            <IconButton label="Show Info" active={info} onClick={onToggleInfo}>
              <Info />
            </IconButton>
          )}
        </ToolbarGroup>
      </Toolbar>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div ref={stage} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {undrawable || error ? (
            <EmptyState
              icon={<ImageOff />}
              title="Could not draw this picture"
              description="The file may be damaged, or use a variant this runtime cannot decode."
            />
          ) : loading || url === null ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : (
            <ImageStage
              url={url}
              name={photo.name}
              view={view}
              onViewChange={setView}
              content={content}
              onContentSize={onContentSize}
              onError={() => setUndrawable(true)}
              checkered={hasTransparency(photo.path)}
            />
          )}
        </div>
        {info && wide && <InfoPanel photo={photo} dimensions={content} />}
      </div>
    </div>
  );
}

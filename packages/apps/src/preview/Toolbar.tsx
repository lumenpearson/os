import { cx, IconButton, Toolbar, ToolbarGroup, ToolbarSpacer } from '@lumen/ui';
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Expand,
  FolderOpen,
  GalleryHorizontalEnd,
  Minimize2,
  RotateCcw,
  RotateCw,
  Scan,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { zoomPercent } from './zoom';

export interface PreviewToolbarProps {
  /** "3 of 12", or empty when the folder holds one previewable file. */
  position: string;
  hasPrevious: boolean;
  hasNext: boolean;
  /** The viewer draws pixels the zoom and rotate controls apply to. */
  zoomable: boolean;
  scale: number;
  fit: boolean;
  hasSource: boolean;
  showingSource: boolean;
  canFilmstrip: boolean;
  filmstrip: boolean;
  fullScreen: boolean;
  hasFile: boolean;
  /** Under this width the rotate group and the zoom reading are dropped. */
  narrow: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onToggleSource: () => void;
  onToggleFilmstrip: () => void;
  onToggleFullScreen: () => void;
  onReveal: () => void;
}

/** The controls that are worth a button; the rest live in the menubar. */
export function PreviewToolbar({
  position,
  hasPrevious,
  hasNext,
  zoomable,
  scale,
  fit,
  hasSource,
  showingSource,
  canFilmstrip,
  filmstrip,
  fullScreen,
  hasFile,
  narrow,
  onPrevious,
  onNext,
  onZoomIn,
  onZoomOut,
  onFit,
  onActualSize,
  onRotateLeft,
  onRotateRight,
  onToggleSource,
  onToggleFilmstrip,
  onToggleFullScreen,
  onReveal,
}: PreviewToolbarProps) {
  return (
    <Toolbar dense>
      <ToolbarGroup>
        <IconButton label="Previous" disabled={!hasPrevious} onClick={onPrevious}>
          <ChevronLeft />
        </IconButton>
        <IconButton label="Next" disabled={!hasNext} onClick={onNext}>
          <ChevronRight />
        </IconButton>
      </ToolbarGroup>
      {position && (
        <span className="mono ml-1 shrink-0 text-xs tabular-nums text-ink-3">{position}</span>
      )}

      <ToolbarSpacer />

      {zoomable && (
        <ToolbarGroup>
          <IconButton label="Zoom Out" onClick={onZoomOut}>
            <ZoomOut />
          </IconButton>
          {!narrow && (
            <button
              type="button"
              onClick={onActualSize}
              title="Actual Size"
              className={cx(
                'mono h-7 min-w-13 rounded-sm px-1 text-xs tabular-nums text-ink-2 lumen-focus',
                'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2 hover:text-ink',
              )}
            >
              {zoomPercent(scale)}%
            </button>
          )}
          <IconButton label="Zoom In" onClick={onZoomIn}>
            <ZoomIn />
          </IconButton>
          <IconButton label="Fit to Window" active={fit} onClick={onFit}>
            <Scan />
          </IconButton>
        </ToolbarGroup>
      )}

      {zoomable && !narrow && (
        <ToolbarGroup className="ml-1">
          <IconButton label="Rotate Left" onClick={onRotateLeft}>
            <RotateCcw />
          </IconButton>
          <IconButton label="Rotate Right" onClick={onRotateRight}>
            <RotateCw />
          </IconButton>
        </ToolbarGroup>
      )}

      <ToolbarSpacer />

      <ToolbarGroup>
        {hasSource && (
          <IconButton label="View Source" active={showingSource} onClick={onToggleSource}>
            <Code2 />
          </IconButton>
        )}
        {canFilmstrip && (
          <IconButton label="Show Filmstrip" active={filmstrip} onClick={onToggleFilmstrip}>
            <GalleryHorizontalEnd />
          </IconButton>
        )}
        {!narrow && (
          <IconButton label="Reveal in Files" disabled={!hasFile} onClick={onReveal}>
            <FolderOpen />
          </IconButton>
        )}
        <IconButton
          label={fullScreen ? 'Leave Full Screen' : 'Full Screen'}
          disabled={!hasFile}
          onClick={onToggleFullScreen}
        >
          {fullScreen ? <Minimize2 /> : <Expand />}
        </IconButton>
      </ToolbarGroup>
    </Toolbar>
  );
}

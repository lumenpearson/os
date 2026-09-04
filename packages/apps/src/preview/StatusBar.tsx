import { ToolbarSpacer } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { formatDateTime } from '../_sdk';
import { formatDimensions, formatDuration } from './document';
import type { Size } from './zoom';

export interface PreviewStatusBarProps {
  name: string;
  /** "PNG Image", "Plain Text" — the VFS label for the extension. */
  typeLabel: string;
  /** Bytes on disk, or null before the file has been measured. */
  size: number | null;
  /** Intrinsic pixels, for anything with them. */
  dimensions: Size | null;
  /** Seconds, for audio and video. */
  duration: number | null;
  /** Epoch milliseconds, or null. */
  modifiedAt: number | null;
  /** Under this width only the name, size and type survive. */
  narrow: boolean;
}

/** Everything here is a reading of the file, so it is all monospace. */
export function PreviewStatusBar({
  name,
  typeLabel,
  size,
  dimensions,
  duration,
  modifiedAt,
  narrow,
}: PreviewStatusBarProps) {
  return (
    <>
      <span className="truncate-1 max-w-64 min-w-0 text-ink">{name}</span>
      <span className="shrink-0 tabular-nums">{size === null ? '—' : formatBytes(size)}</span>
      {dimensions && (
        <span className="shrink-0 tabular-nums">
          {formatDimensions(dimensions.width, dimensions.height)}
        </span>
      )}
      {duration !== null && (
        <span className="shrink-0 tabular-nums">{formatDuration(duration)}</span>
      )}
      <ToolbarSpacer />
      {!narrow && modifiedAt !== null && (
        <span className="shrink-0 tabular-nums">{formatDateTime(modifiedAt)}</span>
      )}
      <span className="shrink-0">{typeLabel}</span>
    </>
  );
}

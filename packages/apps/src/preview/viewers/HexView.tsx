import { formatBytes } from '@lumen/vfs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BYTES_PER_ROW, formatHexCells, hexRows, rowCount, visibleRange } from '../hex';

export interface HexViewProps {
  bytes: Uint8Array;
  /** The file name: the accessible name of the dump. */
  name: string;
  /** Bytes past the read limit, left unread. */
  dropped?: number;
}

/** Row height in pixels; the dump is a fixed grid, so scrolling can be virtual. */
const ROW_HEIGHT = 18;

/**
 * A hex dump of any size: only the rows in view are built, so a 30 MB file
 * costs the same as a 3 KB one. The row model lives in `hex.ts`.
 */
export function HexView({ bytes, name, dropped = 0 }: HexViewProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [port, setPort] = useState({ top: 0, height: 0 });
  const total = rowCount(bytes.length);

  // Scroll fires far faster than a frame; the window is recomputed once per
  // frame and only when the row it starts on actually changed.
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setPort((current) =>
      current.top === el.scrollTop && current.height === el.clientHeight
        ? current
        : { top: el.scrollTop, height: el.clientHeight },
    );
  }, []);

  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    measure();
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  const range = useMemo(
    () => visibleRange(port.top, port.height, ROW_HEIGHT, total),
    [port, total],
  );
  const rows = useMemo(() => hexRows(bytes, range.start, range.end - range.start), [bytes, range]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div
        ref={scroller}
        onScroll={onScroll}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs the keyboard to scroll it
        tabIndex={0}
        role="document"
        aria-label={`${name}, hex dump`}
        className="lumen-scroll min-h-0 flex-1 lumen-focus focus-visible:-outline-offset-2"
      >
        <div style={{ height: total * ROW_HEIGHT }} className="relative min-w-max">
          {rows.map((row) => (
            <div
              key={row.offset}
              style={{ top: (row.offset / BYTES_PER_ROW) * ROW_HEIGHT, height: ROW_HEIGHT }}
              className="mono absolute flex w-full items-center gap-4 px-4 text-xs whitespace-pre tabular-nums"
            >
              <span className="text-ink-3">{row.label}</span>
              <span className="text-ink">{formatHexCells(row.bytes)}</span>
              <span className="text-ink-2">{row.ascii}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mono flex shrink-0 items-center gap-3 border-t border-rule bg-canvas px-4 py-1.5 text-xs text-ink-3">
        <span className="tabular-nums">
          {bytes.length.toLocaleString()} bytes, {BYTES_PER_ROW} per row
        </span>
        {dropped > 0 && (
          <span className="tabular-nums">{formatBytes(dropped)} past the end not read</span>
        )}
      </p>
    </div>
  );
}

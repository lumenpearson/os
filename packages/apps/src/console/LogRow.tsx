// biome-ignore-all lint/a11y/useFocusableInteractive: the grid is the tab stop and moves the selection with the arrow keys; rows are not focusable
import { cx } from '@lumen/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { matchRanges, type Query, splitRanges } from './filter';
import { formatClock, type PayloadLine, singleLine } from './format';
import type { LogLevel, LogRecord } from './types';
import { DETAIL_LINE_HEIGHT, DETAIL_PADDING, ROW_HEIGHT } from './virtual';

/** Weight and opacity carry the level; only an error takes a colour. */
const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-ink-3',
  info: 'text-ink-2',
  warn: 'text-ink font-medium',
  error: 'text-danger font-medium',
};

const MESSAGE_CLASS: Record<LogLevel, string> = {
  debug: 'text-ink-3',
  info: 'text-ink-2',
  warn: 'text-ink',
  error: 'text-danger',
};

/** Indent per level of the payload tree, in pixels. */
const TREE_INDENT = 12;
/** The payload lines start under the message, past the fixed columns. */
const TREE_MARGIN = 32;

function Marked({ text, query }: { text: string; query: Query }) {
  if (query.kind === 'empty') return text;
  const pieces = splitRanges(text, matchRanges(text, query));
  if (pieces.length === 1) return text;
  return pieces.map((piece, index) =>
    piece.hit ? (
      // The accent marks what was searched for. The selected row stays
      // neutral, so a mark never has to be told apart from a selection.
      <span key={index} className="rounded-xs bg-accent-soft text-ink">
        {piece.text}
      </span>
    ) : (
      <span key={index}>{piece.text}</span>
    ),
  );
}

export interface LogRowProps {
  record: LogRecord;
  /** CSS grid tracks, shared with every other row. */
  columns: string;
  showSource: boolean;
  selected: boolean;
  /** The payload as lines when the row is expanded, null when it is not. */
  detail: PayloadLine[] | null;
  query: Query;
  /** Absolute position inside the scrolled list. */
  top: number;
  height: number;
  onSelect: () => void;
  /** One-based, counted against the whole filtered list. */
  rowIndex: number;
  domId: string;
}

function LogRowView({
  record,
  columns,
  showSource,
  selected,
  detail,
  query,
  top,
  height,
  onSelect,
  rowIndex,
  domId,
}: LogRowProps) {
  const hasPayload = record.data !== undefined;
  const Chevron = detail ? ChevronDown : ChevronRight;
  return (
    <div
      id={domId}
      role="row"
      aria-rowindex={rowIndex}
      aria-selected={selected}
      aria-expanded={hasPayload ? detail !== null : undefined}
      onPointerDown={onSelect}
      style={{
        top,
        height,
        gridTemplateColumns: columns,
        gridTemplateRows: `${ROW_HEIGHT}px auto`,
      }}
      className={cx(
        'mono absolute inset-x-0 grid cursor-default items-center gap-x-2 px-2 text-xs select-none',
        selected && 'bg-surface-3',
      )}
    >
      <span aria-hidden className="text-ink-3">
        {hasPayload && <Chevron className="size-3" strokeWidth={2} />}
      </span>
      <span role="gridcell" className="tabular-nums text-ink-3">
        {formatClock(record.timestamp)}
      </span>
      <span role="gridcell" className={cx('truncate-1', LEVEL_CLASS[record.level])}>
        {record.level}
      </span>
      {showSource && (
        <span role="gridcell" className="truncate-1 text-ink-3">
          <Marked text={record.source} query={query} />
        </span>
      )}
      <span role="gridcell" className={cx('truncate-1', MESSAGE_CLASS[record.level])}>
        <Marked text={singleLine(record.message)} query={query} />
      </span>
      {detail && (
        <div
          role="gridcell"
          className="col-span-full flex flex-col"
          style={{ paddingTop: DETAIL_PADDING, paddingBottom: DETAIL_PADDING }}
        >
          {detail.map((line, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 text-2xs"
              style={{
                height: DETAIL_LINE_HEIGHT,
                paddingLeft: TREE_MARGIN + line.depth * TREE_INDENT,
              }}
            >
              {line.key !== null && <span className="shrink-0 text-ink-3">{line.key}:</span>}
              <span className="truncate-1 text-ink-2">{line.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rows re-render only when their own record, state or query changes. */
export const LogRow = memo(LogRowView);

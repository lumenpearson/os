/**
 * The list: pins first, then the history, newest first in both.
 *
 * A click puts the row back on the clipboard, which is the app's one job, so
 * the keyboard has to be able to do it too and to do it deliberately: the
 * arrow keys move the selection and carry focus with them, Enter is the copy.
 * Only the selected row is in the tab order, so a list of twenty-five items
 * is one control rather than twenty-five tab stops.
 */

import { cx } from '@lumen/ui';
import { Files, Pin, Scissors, Type } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { formatRelative } from '../_sdk';
import { type ClipEntry, entryTitle, operationLabel } from './entry';

export interface EntryListProps {
  pinned: ClipEntry[];
  recent: ClipEntry[];
  selectedKey: string | null;
  /** What the kernel has on the clipboard right now, if it is in this list. */
  currentKey: string | null;
  /** The clock the times are measured against, so they age while the window is open. */
  now: number;
  onSelect: (key: string) => void;
  onPutBack: (entry: ClipEntry) => void;
  onRemove: (entry: ClipEntry) => void;
}

export function EntryList({
  pinned,
  recent,
  selectedKey,
  currentKey,
  now,
  onSelect,
  onPutBack,
  onRemove,
}: EntryListProps) {
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const order = useMemo(() => [...pinned, ...recent], [pinned, recent]);
  const tabbableKey = selectedKey ?? order[0]?.key ?? null;

  // A selection made from a menu or by removing a neighbour has to come into
  // view here, and the list scrolls under a sticky header.
  useEffect(() => {
    if (!selectedKey) return;
    rows.current.get(selectedKey)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  const move = useCallback(
    (delta: number | 'first' | 'last') => {
      if (order.length === 0) return;
      const at = order.findIndex((entry) => entry.key === selectedKey);
      const next =
        delta === 'first'
          ? 0
          : delta === 'last'
            ? order.length - 1
            : Math.min(order.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta));
      const entry = order[next];
      if (!entry) return;
      onSelect(entry.key);
      rows.current.get(entry.key)?.focus();
    },
    [order, selectedKey, onSelect],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        move('first');
        break;
      case 'End':
        event.preventDefault();
        move('last');
        break;
      case 'PageDown':
        event.preventDefault();
        move(8);
        break;
      case 'PageUp':
        event.preventDefault();
        move(-8);
        break;
      default:
        break;
    }
  };

  const group = (label: string, entries: ClipEntry[]) =>
    entries.length === 0 ? null : (
      <li>
        <h3 className="mono sticky top-0 z-10 border-b border-rule bg-canvas px-3 py-1 text-2xs text-ink-3">
          {label}
        </h3>
        <ul>
          {entries.map((entry) => (
            <li key={entry.key}>
              <Row
                entry={entry}
                selected={entry.key === selectedKey}
                tabbable={entry.key === tabbableKey}
                current={entry.key === currentKey}
                now={now}
                onSelect={onSelect}
                onPutBack={onPutBack}
                onRemove={onRemove}
                register={(element) => {
                  if (element) rows.current.set(entry.key, element);
                  else rows.current.delete(entry.key);
                }}
              />
            </li>
          ))}
        </ul>
      </li>
    );

  return (
    <div className="lumen-scroll min-h-0 min-w-0 flex-1">
      <ul aria-label="Clipboard items" onKeyDown={onKeyDown}>
        {group('Pinned', pinned)}
        {group('History', recent)}
      </ul>
    </div>
  );
}

interface RowProps {
  entry: ClipEntry;
  selected: boolean;
  tabbable: boolean;
  current: boolean;
  now: number;
  onSelect: (key: string) => void;
  onPutBack: (entry: ClipEntry) => void;
  onRemove: (entry: ClipEntry) => void;
  register: (element: HTMLButtonElement | null) => void;
}

/** The second line: when it was copied, and for files what was done to them. */
function subtitle(entry: ClipEntry, now: number): string {
  const when = formatRelative(entry.copiedAt, now);
  if (entry.kind !== 'files' || !entry.files) return when;
  const count = entry.files.paths.length;
  return `${operationLabel(entry.files)} · ${count} ${count === 1 ? 'path' : 'paths'} · ${when}`;
}

function Row({
  entry,
  selected,
  tabbable,
  current,
  now,
  onSelect,
  onPutBack,
  onRemove,
  register,
}: RowProps) {
  const title = entryTitle(entry);
  const Glyph =
    entry.kind === 'files' ? (entry.files?.operation === 'cut' ? Scissors : Files) : Type;

  return (
    <button
      ref={register}
      type="button"
      tabIndex={tabbable ? 0 : -1}
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        onSelect(entry.key);
        onPutBack(entry);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onPutBack(entry);
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          onRemove(entry);
        }
      }}
      className={cx(
        'flex w-full items-start gap-2 px-3 py-1.5 text-left lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        selected ? 'bg-selection' : 'hover:bg-surface-2',
      )}
    >
      <Glyph aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate-1 text-base text-ink">
          {title === '' ? <span className="text-ink-3">Whitespace</span> : title}
        </span>
        <span className="mono truncate-1 text-2xs text-ink-3">{subtitle(entry, now)}</span>
      </span>
      {current && (
        <span className="mono mt-0.5 shrink-0 text-2xs text-ink-3">on the clipboard</span>
      )}
      {entry.pinned && <Pin aria-hidden className="mt-0.5 size-3 shrink-0 text-accent" />}
    </button>
  );
}

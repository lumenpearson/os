/**
 * The detail pane: the whole of the selected item, and the three things that
 * can be done to it.
 *
 * Text is shown wrapped rather than in a scrolling strip — a copied paragraph
 * is meant to be read — while paths keep their line and scroll sideways,
 * because a path broken across two lines stops looking like a path.
 */

import { Button, IconButton } from '@lumen/ui';
import { Copy, Pin, PinOff, Trash2 } from 'lucide-react';
import { formatRelative } from '../_sdk';
import { type ClipEntry, kindLabel, pinNote, textShape } from './entry';

export interface EntryDetailProps {
  entry: ClipEntry;
  /** The clock the times are measured against. */
  now: number;
  onPutBack: (entry: ClipEntry) => void;
  onTogglePin: (entry: ClipEntry) => void;
  onRemove: (entry: ClipEntry) => void;
}

/** The line under the heading: when, and how much of it there is. */
function meta(entry: ClipEntry, now: number): string {
  const parts = [`Copied ${formatRelative(entry.copiedAt, now)}`];
  if (entry.kind === 'text') {
    const { characters, lines } = textShape(entry.text);
    parts.push(`${characters} ${characters === 1 ? 'character' : 'characters'}`);
    parts.push(`${lines} ${lines === 1 ? 'line' : 'lines'}`);
  }
  if (entry.pinnedAt !== null) parts.push(`pinned ${formatRelative(entry.pinnedAt, now)}`);
  return parts.join(' · ');
}

export function EntryDetail({ entry, now, onPutBack, onTogglePin, onRemove }: EntryDetailProps) {
  const note = pinNote(entry);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-rule px-3 py-2">
        <h2 className="mr-auto truncate-1 min-w-0 text-md font-medium text-ink">
          {kindLabel(entry)}
        </h2>
        <Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => onPutBack(entry)}>
          Put Back
        </Button>
        <IconButton
          size="sm"
          label={entry.pinned ? 'Unpin' : 'Pin'}
          active={entry.pinned}
          onClick={() => onTogglePin(entry)}
        >
          {entry.pinned ? <PinOff /> : <Pin />}
        </IconButton>
        <IconButton size="sm" label="Remove" onClick={() => onRemove(entry)}>
          <Trash2 />
        </IconButton>
      </div>

      <div
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs the keyboard to scroll it
        tabIndex={0}
        role="document"
        aria-label={kindLabel(entry)}
        className="lumen-scroll min-h-0 min-w-0 flex-1 lumen-focus focus-visible:-outline-offset-2"
      >
        <p className="mono px-3 pt-2 text-2xs text-ink-3 tabular-nums">{meta(entry, now)}</p>
        {note && <p className="px-3 pt-1 text-sm text-ink-2">{note}</p>}
        {entry.kind === 'text' ? (
          <pre className="mono min-w-0 px-3 py-2 text-sm leading-5 whitespace-pre-wrap break-words text-ink">
            {entry.text}
          </pre>
        ) : (
          <ul aria-label="Paths" className="flex flex-col px-3 py-2">
            {(entry.files?.paths ?? []).map((path, index) => (
              <li
                key={`${index}-${path}`}
                className="mono whitespace-nowrap text-sm leading-5 text-ink"
              >
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

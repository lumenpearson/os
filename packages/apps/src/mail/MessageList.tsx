import { cx, EmptyState, Select } from '@lumen/ui';
import { Flag, Paperclip, Search } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef } from 'react';
import { displaySubject } from './compose';
import {
  displayAddress,
  type FormatOptions,
  formatAddressList,
  formatStamp,
  snippet,
} from './format';
import { SORT_KEYS, SORT_LABELS, type SortKey } from './store';
import type { Thread } from './thread';

const SORT_OPTIONS = SORT_KEYS.map((value) => ({ value, label: SORT_LABELS[value] }));

export interface MessageListProps {
  threads: readonly Thread[];
  /** The mailbox name, printed above the rows. */
  title: string;
  selectedId: string | null;
  sort: SortKey;
  /** Sent and Drafts show who the message went to, not who it came from. */
  showRecipients: boolean;
  /** A search is running, so an empty list means "no matches". */
  searching: boolean;
  o: FormatOptions;
  now: number;
  onSort: (sort: SortKey) => void;
  onSelect: (messageId: string) => void;
  /** Enter or a double click; on a narrow window this hands over to the reading pane. */
  onActivate: (messageId: string) => void;
  className?: string;
  /** Only the measured width of the pane; everything else is a class. */
  style?: CSSProperties;
}

/** The middle pane: one row per conversation, newest first by default. */
export function MessageList({
  threads,
  title,
  selectedId,
  sort,
  showRecipients,
  searching,
  o,
  now,
  onSort,
  onSelect,
  onActivate,
  className,
  style,
}: MessageListProps) {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const index = threads.findIndex((t) => t.messages.some((m) => m.id === selectedId));
  const rowId = (i: number) => `${listId}-row-${i}`;

  // Keep the selected row in view when the selection moves from somewhere
  // else: the keyboard, a reply landing, a mailbox change.
  useEffect(() => {
    if (index < 0) return;
    const row = boxRef.current?.children.item(index);
    if (row instanceof HTMLElement) row.scrollIntoView?.({ block: 'nearest' });
  });

  const step = (to: number) => {
    const clamped = Math.max(0, Math.min(threads.length - 1, to));
    const thread = threads[clamped];
    if (thread) onSelect(thread.latest.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (threads.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        step(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        step(index < 0 ? 0 : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        step(0);
        break;
      case 'End':
        e.preventDefault();
        step(threads.length - 1);
        break;
      case 'Enter': {
        const thread = threads[index];
        if (thread) {
          e.preventDefault();
          onActivate(thread.latest.id);
        }
        break;
      }
    }
  };

  return (
    <div
      style={style}
      className={cx('flex min-w-0 flex-col border-r border-rule bg-surface', className)}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-rule px-3">
        <span className="truncate-1 text-sm font-medium text-ink">{title}</span>
        <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">{threads.length}</span>
        <div className="flex-1" />
        <Select
          size="sm"
          aria-label="Sort messages by"
          options={SORT_OPTIONS}
          value={sort}
          onChange={onSort}
          className="shrink-0"
        />
      </div>
      {threads.length === 0 ? (
        <EmptyState
          icon={searching ? <Search /> : undefined}
          title={searching ? 'No matches' : 'No messages'}
          description={
            searching
              ? 'Try fewer words, or search another mailbox with in:inbox.'
              : 'Messages you file here will show up in this list.'
          }
        />
      ) : (
        <div
          ref={boxRef}
          role="listbox"
          aria-label="Messages"
          aria-activedescendant={index >= 0 ? rowId(index) : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="lumen-scroll min-h-0 flex-1 lumen-focus"
        >
          {threads.map((thread, i) => {
            const message = thread.latest;
            const selected = i === index;
            const who = showRecipients
              ? formatAddressList(message.to) || 'No recipient'
              : displayAddress(message.from) || 'Unknown sender';
            return (
              // The listbox owns focus and points at the active row with
              // aria-activedescendant, so a row is not a tab stop of its own.
              // biome-ignore lint/a11y/useFocusableInteractive: the container is the tab stop
              <div
                key={thread.id}
                id={rowId(i)}
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(message.id)}
                onDoubleClick={() => onActivate(message.id)}
                className={cx(
                  'grid cursor-default grid-cols-[8px_minmax(0,1fr)] items-start gap-2 border-b border-rule px-3 py-2',
                  'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                  selected ? 'bg-selection' : 'hover:bg-surface-2',
                )}
              >
                <span className="flex h-4 items-center justify-center">
                  {thread.unread > 0 && (
                    // An unread marker is a dot, and a dot is a circle; the
                    // radius scale is for boxes.
                    // deslop-ignore-next-line 19
                    <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cx(
                        'truncate-1 text-base text-ink',
                        thread.unread > 0 ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {who}
                    </span>
                    {thread.messages.length > 1 && (
                      <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                        {thread.messages.length}
                      </span>
                    )}
                    <span className="flex-1" />
                    {thread.flagged && (
                      <Flag
                        role="img"
                        aria-label="Flagged"
                        className="size-3 shrink-0 text-accent"
                      />
                    )}
                    {thread.attachments > 0 && (
                      <Paperclip
                        role="img"
                        aria-label="Attachment"
                        className="size-3 shrink-0 text-ink-3"
                      />
                    )}
                    <span className="mono shrink-0 text-2xs tabular-nums text-ink-3">
                      {formatStamp(message.date, now, o)}
                    </span>
                  </div>
                  <span className="truncate-1 text-base text-ink-2">
                    {displaySubject(thread.subject || message.subject)}
                  </span>
                  <span className="truncate-1 text-sm text-ink-3">
                    {snippet(message.body, 120)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

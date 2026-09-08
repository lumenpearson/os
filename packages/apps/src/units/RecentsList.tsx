/**
 * The conversions kept from earlier, newest first. A row restores the whole
 * conversion — value, both units and the category — so the list works as a
 * set of bookmarks rather than as a log.
 */

import { Button } from '@lumen/ui';
import { Trash2 } from 'lucide-react';
import { unitById } from './catalogue';
import { convert, formatQuantity } from './convert';
import { type RecentConversion, recentKey } from './storage';

export interface RecentsListProps {
  entries: readonly RecentConversion[];
  onPick: (entry: RecentConversion) => void;
  onClear: () => void;
}

export function RecentsList({ entries, onPick, onClear }: RecentsListProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-rule">
      {/* The list keeps the same measure as the fields above it. */}
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <header className="flex h-8 shrink-0 items-center gap-2 px-3">
          <h2 className="text-md font-medium text-ink">Recent</h2>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            icon={<Trash2 className="size-3.5" />}
            disabled={entries.length === 0}
            onClick={onClear}
          >
            Clear
          </Button>
        </header>
        {entries.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-ink-3">
            Press Enter in a value field, or copy a result, to keep it here.
          </p>
        ) : (
          <ul aria-label="Recent conversions" className="lumen-scroll min-h-0 flex-1 px-2 pb-2">
            {entries.map((entry) => {
              const from = unitById(entry.from);
              const to = unitById(entry.to);
              const result = convert(entry.value, entry.from, entry.to);
              if (!from || !to || result === null) return null;
              const left = formatQuantity(entry.value, from);
              const right = formatQuantity(result, to);
              return (
                <li key={recentKey(entry)}>
                  <button
                    type="button"
                    aria-label={`${left} equals ${right}`}
                    onClick={() => onPick(entry)}
                    className="mono flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-sm tabular-nums lumen-focus hover:bg-surface-2"
                  >
                    <span className="truncate-1 text-ink">{left}</span>
                    <span aria-hidden className="shrink-0 text-ink-3">
                      =
                    </span>
                    <span className="truncate-1 text-ink-2">{right}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

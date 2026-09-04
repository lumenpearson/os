import { Button, EmptyState, IconButton, SearchField, SettingsPage, useDialogs } from '@lumen/ui';
import { Clock, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { formatDate, formatTime } from '../../_sdk';
import { groupVisitsByDay, relativeDayLabel, searchVisits, type Visit } from '../history';
import { displayUrl } from '../url';

export interface HistoryPageProps {
  history: readonly Visit[];
  onNavigate: (url: string) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

/** Every visit, newest first, cut into days. */
export function HistoryPage({ history, onNavigate, onRemove, onClearAll }: HistoryPageProps) {
  const dialogs = useDialogs();
  const [query, setQuery] = useState('');
  const now = Date.now();
  const matches = searchVisits(history, query);
  const days = groupVisitsByDay(matches);

  const clearAll = async () => {
    const ok = await dialogs.confirm({
      title: 'Clear browsing history?',
      message: `${history.length} ${history.length === 1 ? 'page' : 'pages'} will be removed. Bookmarks are kept.`,
      confirmLabel: 'Clear History',
      danger: true,
    });
    if (ok) onClearAll();
  };

  if (history.length === 0) {
    return (
      <EmptyState
        icon={<Clock />}
        title="No history yet"
        description="Pages you open are listed here until you clear them."
      />
    );
  }

  return (
    <SettingsPage title="History">
      <div className="flex items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search history"
          aria-label="Search history"
          className="flex-1"
        />
        <Button variant="danger" icon={<Trash2 />} onClick={() => void clearAll()}>
          Clear All
        </Button>
      </div>

      {days.length === 0 ? (
        <p className="text-base text-ink-2">Nothing in history matches “{query.trim()}”.</p>
      ) : (
        days.map(({ day, visits }) => {
          const label = relativeDayLabel(day, now);
          return (
            <section key={day} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2 px-1">
                <h2 className="text-md font-medium text-ink">{label ?? formatDate(day, 'long')}</h2>
                {label && (
                  <span className="mono text-xs text-ink-3 tabular-nums">{formatDate(day)}</span>
                )}
              </div>
              <ul className="divide-y divide-rule rounded-md border border-rule bg-surface">
                {visits.map((v) => (
                  <li key={v.id} className="group flex items-center gap-3 px-3 py-2">
                    <span className="mono w-14 shrink-0 text-xs text-ink-3 tabular-nums">
                      {formatTime(v.visitedAt)}
                    </span>
                    <button
                      type="button"
                      title={v.url}
                      onClick={() => onNavigate(v.url)}
                      className="min-w-0 flex-1 rounded-xs text-left lumen-focus"
                    >
                      <span className="block truncate-1 text-base text-ink">
                        {v.title || displayUrl(v.url)}
                      </span>
                      <span className="mono block truncate-1 text-xs text-ink-3">
                        {displayUrl(v.url)}
                      </span>
                    </button>
                    <IconButton
                      label={`Remove ${v.title || displayUrl(v.url)} from history`}
                      size="sm"
                      onClick={() => onRemove(v.id)}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                    >
                      <X />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </SettingsPage>
  );
}

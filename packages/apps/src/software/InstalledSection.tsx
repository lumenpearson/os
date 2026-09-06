import { Button, cx, EmptyState } from '@lumen/ui';
import { PackageSearch } from 'lucide-react';
import { DetailsPane } from './DetailsPane';
import { EntryIcon } from './EntryIcon';
import { KIND_LABELS, type LibraryEntry } from './library';
import { type AvailableUpdate, updateCountLabel } from './updates';

function EntryRow({
  entry,
  selected,
  onSelect,
  onOpen,
}: {
  entry: LibraryEntry;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        onDoubleClick={onOpen}
        className={cx(
          'flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 text-left lumen-focus',
          'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
          selected ? 'bg-selection' : 'hover:bg-surface-2',
        )}
      >
        <EntryIcon entry={entry} size={28} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate-1 text-base text-ink">{entry.name}</span>
            {entry.version && (
              <span className="mono shrink-0 text-2xs text-ink-3 tabular-nums">
                {entry.version}
              </span>
            )}
          </span>
          <span className="truncate-1 block text-sm text-ink-2">
            {entry.description || KIND_LABELS[entry.kind]}
          </span>
        </span>
        <span className="mono shrink-0 text-2xs text-ink-3">
          {entry.source === 'built-in' ? 'system' : 'installed'}
        </span>
      </button>
      <Button size="sm" onClick={onOpen}>
        Open
      </Button>
    </li>
  );
}

/**
 * The line above the list when the store has newer versions of things on the
 * system. It appears only when there is something to say — a bar reading "no
 * updates" on every visit is a bar nobody reads — and under Automatic updates
 * it reports rather than asks, because the installs are already running.
 */
function UpdatesBar({
  updates,
  automatic,
  onUpdateAll,
}: {
  updates: readonly AvailableUpdate[];
  automatic: boolean;
  onUpdateAll: () => void;
}) {
  if (updates.length === 0) return null;
  const names = updates.map((u) => `${u.name} ${u.from} → ${u.to}`).join(', ');
  return (
    <div className="flex items-center gap-3 border-rule border-b bg-surface-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-base text-ink">{updateCountLabel(updates.length)}</span>
        <span className="mono truncate-1 block text-2xs text-ink-2 tabular-nums">{names}</span>
      </span>
      {automatic ? (
        <span className="shrink-0 text-sm text-ink-2">Installing automatically</span>
      ) : (
        <Button size="sm" onClick={onUpdateAll}>
          Update All
        </Button>
      )}
    </div>
  );
}

export interface InstalledSectionProps {
  entries: readonly LibraryEntry[];
  selected: LibraryEntry | null;
  /** False below ~640px: one pane at a time. */
  wide: boolean;
  /** Installed packages the store has a newer version of. */
  updates: readonly AvailableUpdate[];
  /** Settings > General > Automatic updates. */
  automatic: boolean;
  onUpdateAll: () => void;
  onSelect: (id: string | null) => void;
  onOpen: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
}

export function InstalledSection({
  entries,
  selected,
  wide,
  updates,
  automatic,
  onUpdateAll,
  onSelect,
  onOpen,
  onRemove,
}: InstalledSectionProps) {
  if (!wide && selected) {
    return (
      <DetailsPane
        entry={selected}
        className="min-h-0 flex-1"
        onBack={() => onSelect(null)}
        onOpen={() => onOpen(selected)}
        onRemove={() => onRemove(selected)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <UpdatesBar updates={updates} automatic={automatic} onUpdateAll={onUpdateAll} />
      <div className="flex min-h-0 flex-1">
        {entries.length === 0 ? (
          <EmptyState
            icon={<PackageSearch />}
            title="No apps match"
            description="Try another search, or choose a different category."
          />
        ) : (
          <ul
            className="lumen-scroll flex min-w-0 flex-1 flex-col gap-px p-2"
            aria-label="Installed apps"
          >
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                selected={selected?.id === entry.id}
                onSelect={() => onSelect(entry.id)}
                onOpen={() => onOpen(entry)}
              />
            ))}
          </ul>
        )}
        {wide && selected && (
          <DetailsPane
            entry={selected}
            className="w-72 shrink-0 border-l border-rule"
            onOpen={() => onOpen(selected)}
            onRemove={() => onRemove(selected)}
          />
        )}
      </div>
    </div>
  );
}

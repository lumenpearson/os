import { Button, cx, EmptyState } from '@lumen/ui';
import { PackageSearch } from 'lucide-react';
import { DetailsPane } from './DetailsPane';
import { EntryIcon } from './EntryIcon';
import { KIND_LABELS, type LibraryEntry } from './library';

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

export interface InstalledSectionProps {
  entries: readonly LibraryEntry[];
  selected: LibraryEntry | null;
  /** False below ~640px: one pane at a time. */
  wide: boolean;
  onSelect: (id: string | null) => void;
  onOpen: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
}

export function InstalledSection({
  entries,
  selected,
  wide,
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
  );
}

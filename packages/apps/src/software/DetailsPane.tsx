import { useVfs } from '@lumen/kernel/react';
import { Button, cx } from '@lumen/ui';
import { ArrowLeft, Play, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { formatDateTime } from '../_sdk';
import { EntryIcon } from './EntryIcon';
import { checkRemoval } from './install';
import { CATEGORY_LABELS, KIND_LABELS, type LibraryEntry } from './library';
import { describeCapabilities } from './manifest';
import { CapabilityList } from './Report';

const EM_DASH = '—';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-rule py-1.5">
      <dt className="shrink-0 text-sm text-ink-3">{label}</dt>
      <dd className="mono min-w-0 truncate text-right text-sm text-ink tabular-nums">{children}</dd>
    </div>
  );
}

function windowLine(entry: LibraryEntry): string {
  const w = entry.definition?.window ?? entry.manifest?.window;
  if (!w?.width || !w?.height) return EM_DASH;
  const min = w.minWidth && w.minHeight ? ` (min ${w.minWidth}×${w.minHeight})` : '';
  return `${w.width}×${w.height}${min}`;
}

function associationsLine(entry: LibraryEntry): string {
  const assoc = entry.definition?.fileAssociations;
  if (!assoc || assoc.length === 0) return 'None';
  return assoc.flatMap((a) => a.extensions).join(' ');
}

/** The `.app` file's timestamp: when the OS wrote it. Built-ins have none. */
function useInstalledAt(path: string | null): number | null {
  const vfs = useVfs();
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    if (!path) {
      setAt(null);
      return;
    }
    let alive = true;
    vfs
      .stat(path)
      .then((st) => alive && setAt(st.modifiedAt))
      .catch(() => alive && setAt(null));
    return () => {
      alive = false;
    };
  }, [vfs, path]);
  return at;
}

export interface DetailsPaneProps {
  entry: LibraryEntry;
  onOpen: () => void;
  onRemove: () => void;
  /** Shown as a back button when the window is too narrow for two panes. */
  onBack?: () => void;
  className?: string;
}

export function DetailsPane({ entry, onOpen, onRemove, onBack, className }: DetailsPaneProps) {
  const installedAt = useInstalledAt(entry.path);
  const removal = checkRemoval(entry);
  const capabilities = entry.manifest ? describeCapabilities(entry.manifest) : [];

  return (
    <aside className={cx('lumen-scroll flex flex-col gap-4 bg-canvas p-4', className)}>
      {onBack && (
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft />}
          className="self-start"
          onClick={onBack}
        >
          All apps
        </Button>
      )}
      <header className="flex items-start gap-3">
        <EntryIcon entry={entry} size={40} />
        <div className="min-w-0">
          <h2 className="text-md font-medium text-ink">{entry.name}</h2>
          <p className="mono text-sm text-ink-3 tabular-nums">
            {entry.version ? `${entry.version} · ` : ''}
            {entry.source === 'built-in' ? 'part of the system' : 'installed'}
          </p>
        </div>
      </header>

      {entry.description && <p className="text-base text-ink-2">{entry.description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Play />} onClick={onOpen}>
          Open
        </Button>
        {removal.removable ? (
          <Button variant="ghost" icon={<Trash2 />} onClick={onRemove}>
            Remove
          </Button>
        ) : (
          <span className="text-sm text-ink-3">{removal.reason}</span>
        )}
      </div>

      <dl className="flex flex-col">
        <Row label="Identifier">{entry.id}</Row>
        <Row label="Kind">{KIND_LABELS[entry.kind]}</Row>
        <Row label="Category">{CATEGORY_LABELS[entry.category]}</Row>
        <Row label="Version">{entry.version ?? EM_DASH}</Row>
        <Row label="Window">{windowLine(entry)}</Row>
        <Row label="Opens">{associationsLine(entry)}</Row>
        <Row label="Manifest">{entry.path ?? EM_DASH}</Row>
        <Row label="Installed">{installedAt ? formatDateTime(installedAt) : EM_DASH}</Row>
      </dl>

      {capabilities.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm text-ink-3">What it can do</h3>
          <CapabilityList capabilities={capabilities} />
        </section>
      )}
    </aside>
  );
}

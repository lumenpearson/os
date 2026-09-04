import type { AppManifest } from '@lumen/kernel';
import { Button, EmptyState } from '@lumen/ui';
import { PackageSearch } from 'lucide-react';
import { type CatalogueStatus, catalogueStatus } from './catalogue';
import { ManifestTile } from './EntryIcon';
import type { LibraryEntry } from './library';
import { describeCapabilities } from './manifest';

function Card({
  manifest,
  status,
  busy,
  onInstall,
  onOpen,
}: {
  manifest: AppManifest;
  status: CatalogueStatus;
  busy: boolean;
  onInstall: () => void;
  onOpen: () => void;
}) {
  const capability = describeCapabilities(manifest)[0]?.label ?? '';
  return (
    <li className="flex flex-col gap-2 rounded-md border border-rule bg-surface p-3">
      <div className="flex items-start gap-3">
        <ManifestTile manifest={manifest} size={32} />
        <div className="min-w-0">
          <h3 className="text-base font-medium text-ink">{manifest.name}</h3>
          <p className="mono text-2xs text-ink-3 tabular-nums">
            {manifest.id}
            {manifest.version ? ` · ${manifest.version}` : ''}
          </p>
        </div>
      </div>
      <p className="text-base text-ink-2">{manifest.description}</p>
      <p className="text-sm text-ink-3">{capability}</p>
      <div className="mt-1 flex items-center gap-2">
        {status === 'installed' ? (
          <>
            <Button size="sm" onClick={onOpen}>
              Open
            </Button>
            <span className="mono text-2xs text-ink-3">installed</span>
          </>
        ) : status === 'shadowed' ? (
          <span className="text-sm text-ink-3">A built-in app already uses this identifier.</span>
        ) : (
          <Button size="sm" variant="primary" disabled={busy} onClick={onInstall}>
            Install
          </Button>
        )}
      </div>
    </li>
  );
}

export interface CatalogueSectionProps {
  /** The bundled manifests to show, already filtered by the search field. */
  manifests: readonly AppManifest[];
  /** Everything on the system, to tell installed from available. */
  entries: readonly LibraryEntry[];
  busy: boolean;
  onInstall: (manifest: AppManifest) => void;
  onOpen: (manifest: AppManifest) => void;
}

/** The programs bundled with the OS, installable in one press. */
export function CatalogueSection({
  manifests,
  entries,
  busy,
  onInstall,
  onOpen,
}: CatalogueSectionProps) {
  if (manifests.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch />}
        title="No bundled program matches"
        description="The catalogue holds five small programs. Clear the search to see them."
      />
    );
  }
  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="flex flex-col gap-3 px-4 py-5">
        <p className="max-w-2xl text-base text-ink-2">
          Small programs that ship with Lumen OS. Each one is a <span className="mono">.app</span>{' '}
          manifest holding an HTML document; installing copies it into{' '}
          <span className="mono">/Applications</span> and it runs in a sandboxed frame.
        </p>
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {manifests.map((manifest) => (
            <Card
              key={manifest.id}
              manifest={manifest}
              status={catalogueStatus(manifest, entries)}
              busy={busy}
              onInstall={() => onInstall(manifest)}
              onOpen={() => onOpen(manifest)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

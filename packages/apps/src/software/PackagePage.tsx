import type { AppManifest } from '@lumen/kernel';
import { Button, cx, Spinner } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { ArrowLeft, Download, Play } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { formatDate } from '../_sdk';
import { ArtworkPanel } from './ArtworkPanel';
import type { InstallJob } from './installer';
import { describeCapabilities } from './manifest';
import { PackageMark, PackageTile } from './PackageTile';
import { CapabilityList } from './Report';
import { fetchPackage, type PackageDocument, type StoreError } from './remote';
import { errorAddress, errorHeadline } from './source';
import {
  capabilityLabel,
  categoryLabel,
  KIND_LABELS,
  type Listing,
  type ListingStatus,
  PRICE_LABELS,
  requirementLine,
} from './storefront';

const EM_DASH = '—';

interface DocumentState {
  loading: boolean;
  document: PackageDocument | null;
  error: StoreError | null;
}

/** The package's own file. A program that ships with the OS has none to fetch. */
function usePackageDocument(base: string, listing: Listing): DocumentState {
  const [state, setState] = useState<DocumentState>({
    loading: listing.origin === 'store',
    document: null,
    error: null,
  });
  const { id, origin } = listing;

  useEffect(() => {
    if (origin === 'system') {
      setState({ loading: false, document: null, error: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, document: null, error: null });
    void fetchPackage(base, id).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { loading: false, document: result.value, error: null }
          : { loading: false, document: null, error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [base, id, origin]);

  return state;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-rule py-1.5">
      <dt className="shrink-0 text-sm text-ink-3">{label}</dt>
      <dd className="mono min-w-0 truncate text-right text-sm text-ink tabular-nums">{children}</dd>
    </div>
  );
}

function Paragraphs({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)} className="text-base text-ink-2">
          {paragraph}
        </p>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-md font-medium text-ink">{title}</h3>
      {children}
    </section>
  );
}

export interface PackagePageProps {
  listing: Listing;
  base: string;
  status: ListingStatus;
  /** The install running for this package, if there is one. */
  job: InstallJob | undefined;
  /** Every listing, so a bundle can show what it installs. */
  index: ReadonlyMap<string, Listing>;
  statusOf: (listing: Listing) => ListingStatus;
  compact: boolean;
  onBack: () => void;
  onOpenListing: (listing: Listing) => void;
  onInstall: (document: PackageDocument) => void;
  onInstallSystem: (manifest: AppManifest) => void;
  onOpenApp: (id: string) => void;
}

/** One package in full: what it is, what it needs, and what installing it does. */
export function PackagePage({
  listing,
  base,
  status,
  job,
  index,
  statusOf,
  compact,
  onBack,
  onOpenListing,
  onInstall,
  onInstallSystem,
  onOpenApp,
}: PackagePageProps) {
  const state = usePackageDocument(base, listing);
  const document = state.document;
  const manifest = listing.manifest;
  const running = job?.state === 'running';
  const capabilities = document?.capabilities ?? [];
  const manifestCapabilities = manifest ? describeCapabilities(manifest) : [];
  const members =
    document?.kind === 'bundle'
      ? document.members.map((id) => index.get(id)).filter((l): l is Listing => l !== undefined)
      : [];

  const install = () => {
    if (manifest) {
      onInstallSystem(manifest);
      return;
    }
    if (document) onInstall(document);
  };

  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-4">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft />}
          className="self-start"
          onClick={onBack}
        >
          Back
        </Button>

        <header className="flex items-start gap-3">
          <PackageMark listing={listing} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-ink">{listing.name}</h2>
            <p className="text-base text-ink-2">{listing.tagline}</p>
            <p className="mono text-sm text-ink-3 tabular-nums">
              {listing.publisher}
              {listing.version ? ` · ${listing.version}` : ''} · {formatBytes(listing.size)}
              {' · '}
              {PRICE_LABELS[listing.price]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status === 'installed' && listing.kind === 'app' ? (
              <Button variant="primary" icon={<Play />} onClick={() => onOpenApp(listing.id)}>
                Open
              </Button>
            ) : status === 'installed' ? (
              <span className="text-sm text-ink-2">Installed</span>
            ) : status === 'shadowed' ? (
              <span className="max-w-40 text-sm text-ink-2">
                A built-in app already uses this identifier.
              </span>
            ) : (
              <Button
                variant="primary"
                icon={<Download />}
                loading={running}
                disabled={running || state.loading || (!manifest && document === null)}
                onClick={install}
              >
                Get
              </Button>
            )}
          </div>
        </header>

        {state.loading && (
          <p className="flex items-center gap-2 text-base text-ink-2">
            <Spinner size={14} /> Reading the package…
          </p>
        )}

        {state.error !== null && (
          <div className="flex flex-col gap-1 rounded-md border border-rule bg-canvas p-3">
            <p className="text-base font-medium text-ink">{errorHeadline(state.error)}</p>
            <p className="text-base text-ink-2">{state.error.message}</p>
            <p className="mono truncate text-sm text-ink-3">{errorAddress(state.error)}</p>
          </div>
        )}

        {document !== null && <Paragraphs text={document.description} />}
        {document === null && manifest?.description && (
          <p className="text-base text-ink-2">{manifest.description}</p>
        )}

        {document !== null && document.screenshots.length > 0 && (
          <Section title="Screenshots">
            <div
              className={cx(
                'grid gap-3',
                compact
                  ? 'grid-cols-1'
                  : '[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]',
              )}
            >
              {document.screenshots.map((artwork) => (
                <ArtworkPanel
                  key={`${artwork.shape}-${artwork.seed}-${artwork.tone}`}
                  artwork={artwork}
                  className="h-28"
                />
              ))}
            </div>
          </Section>
        )}

        {members.length > 0 && (
          <Section title={`Installs ${members.length} packages`}>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {members.map((member) => (
                <PackageTile
                  key={member.id}
                  listing={member}
                  status={statusOf(member)}
                  onOpen={() => onOpenListing(member)}
                />
              ))}
            </div>
          </Section>
        )}

        {document?.releaseNotes && (
          <Section title={`New in ${listing.version}`}>
            <Paragraphs text={document.releaseNotes} />
          </Section>
        )}

        {capabilities.length > 0 && (
          <Section title="What installing it allows">
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {capabilities.map((id) => (
                <li key={id} className="py-1.5 text-base text-ink-2">
                  {capabilityLabel(id) ?? (
                    <>
                      Declared as <span className="mono text-sm text-ink">{id}</span>.
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {manifestCapabilities.length > 0 && (
          <Section title="What installing it allows">
            <CapabilityList capabilities={manifestCapabilities} />
          </Section>
        )}

        <Section title="Details">
          <dl className="flex flex-col">
            <Row label="Identifier">{listing.id}</Row>
            <Row label="Kind">{KIND_LABELS[listing.kind]}</Row>
            <Row label="Category">{categoryLabel(listing.category)}</Row>
            <Row label="Version">{listing.version || EM_DASH}</Row>
            <Row label="Size">{formatBytes(listing.size)}</Row>
            <Row label="Price">{PRICE_LABELS[listing.price]}</Row>
            <Row label="Updated">
              {listing.updated ? formatDate(Date.parse(listing.updated)) : 'Ships with the system'}
            </Row>
            <Row label="Requires">{requirementLine(document?.requires.os ?? null)}</Row>
            {document !== null && document.kind !== 'bundle' && (
              <Row label="Checksum">{document.sha256}</Row>
            )}
          </dl>
        </Section>
      </div>
    </div>
  );
}

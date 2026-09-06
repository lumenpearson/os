import { cx } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { ICON_TONES, ManifestIcon } from '../_sdk';
import { KIND_LABELS, type Listing, type ListingStatus, PRICE_LABELS } from './storefront';

function tileStyle(size: number) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: Math.max(3, Math.round(size * 0.22)),
    background: ICON_TONES.graphite,
    boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.14), 0 1px 1px rgb(0 0 0 / 0.18)',
    color: '#fff',
    flexShrink: 0,
  } as const;
}

/**
 * The mark on a tile. An app draws the icon its manifest carries or the
 * initial the OS gives a program without one; the other three kinds draw what
 * they are — two letters for a typeface, four marks for an icon set, a stack
 * for a bundle — on the same graphite tile, so a shelf of mixed kinds reads as
 * one family.
 */
export function PackageMark({ listing, size }: { listing: Listing; size: number }) {
  if (listing.kind === 'app') {
    return <ManifestIcon size={size} name={listing.name} icon={listing.manifest?.icon} />;
  }
  if (listing.kind === 'font') {
    return (
      <span
        aria-hidden
        // Two letterforms standing for a typeface: the accent case design rule
        // 1 sets in the monospace face.
        // deslop-ignore-next-line 34
        style={{
          ...tileStyle(size),
          fontFamily: 'var(--font-mono)',
          fontSize: Math.round(size * 0.4),
          fontWeight: 600,
        }}
      >
        Aa
      </span>
    );
  }
  const glyph = Math.round(size * 0.5);
  return (
    <span aria-hidden style={tileStyle(size)}>
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" aria-hidden>
        {listing.kind === 'icons' ? (
          <g fill="currentColor">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" opacity="0.6" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" opacity="0.6" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </g>
        ) : (
          <g fill="currentColor">
            <rect x="3" y="4" width="18" height="4" rx="1.5" />
            <rect x="3" y="10" width="18" height="4" rx="1.5" opacity="0.75" />
            <rect x="3" y="16" width="18" height="4" rx="1.5" opacity="0.5" />
          </g>
        )}
      </svg>
    </span>
  );
}

export interface PackageTileProps {
  listing: Listing;
  status: ListingStatus;
  /** True while this package is being installed. */
  busy?: boolean;
  onOpen: () => void;
  className?: string;
}

/** One package on a shelf: what it is, who publishes it, how large, what it costs. */
export function PackageTile({ listing, status, busy, onOpen, className }: PackageTileProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex flex-col items-start gap-2 rounded-md border border-rule bg-surface p-3 text-left lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:border-rule-strong hover:bg-surface-2',
        className,
      )}
    >
      <span className="flex w-full items-start gap-2.5">
        <PackageMark listing={listing} size={32} />
        <span className="min-w-0 flex-1">
          <span className="truncate-1 block text-base font-medium text-ink">{listing.name}</span>
          <span className="truncate-1 block text-sm text-ink-2">{listing.publisher}</span>
        </span>
      </span>
      <span className="line-clamp-2 text-sm text-ink-2">{listing.tagline}</span>
      <span className="mono mt-auto flex w-full items-center gap-2 text-2xs text-ink-3 tabular-nums">
        <span>{KIND_LABELS[listing.kind]}</span>
        <span aria-hidden>·</span>
        <span>{formatBytes(listing.size)}</span>
        <span className="ms-auto truncate-1 text-ink-2">
          {busy
            ? 'Installing'
            : status === 'installed'
              ? 'Installed'
              : status === 'shadowed'
                ? 'Shadowed'
                : PRICE_LABELS[listing.price]}
        </span>
      </span>
    </button>
  );
}

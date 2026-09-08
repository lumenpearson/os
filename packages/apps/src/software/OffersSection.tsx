/**
 * Offers: what a plan changes about this store.
 *
 * There are no sales here, and that is deliberate. The catalogue prices a
 * package as `free` or `subscription` and nothing else, so a struck-through
 * number would be a number the store never charged. The one real offer is the
 * plan itself: the yearly costs less than twelve monthlies by an amount
 * `plans.ts` states, and it lets through a set of packages this screen can
 * count. Every figure below is read from the catalogue in hand or from the
 * plans; none of it is decoration.
 */

import { Button, EmptyState, Spinner } from '@lumen/ui';
import { Tag } from 'lucide-react';
import { useMemo } from 'react';
import {
  type AccountState,
  formatPrice,
  MONTHLY_PLAN,
  YEARLY_DISCOUNT_MINOR,
  YEARLY_PLAN,
} from './account';
import { coverageLabel, planIsRunning, planOffer } from './offers';
import { PackageTile } from './PackageTile';
import type { CatalogueView } from './source';
import { emptyLines } from './source';
import type { Listing, ListingStatus } from './storefront';

export interface OffersSectionProps {
  view: CatalogueView;
  listings: readonly Listing[];
  state: AccountState;
  now: number;
  statusOf: (listing: Listing) => ListingStatus;
  busyIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
  /** Take the person to the plans, where a subscription is actually taken. */
  onSeePlans: () => void;
  onRefresh: () => void;
}

function Shelf({
  title,
  detail,
  listings,
  statusOf,
  busyIds,
  onOpen,
}: {
  title: string;
  detail: string;
  listings: readonly Listing[];
  statusOf: (listing: Listing) => ListingStatus;
  busyIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
}) {
  if (listings.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline gap-3">
        <h3 className="text-md font-semibold text-ink">{title}</h3>
        <span className="mono text-sm text-ink-3 tabular-nums">{detail}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
        {listings.map((listing) => (
          <PackageTile
            key={listing.id}
            listing={listing}
            status={statusOf(listing)}
            busy={busyIds.has(listing.id)}
            onOpen={() => onOpen(listing.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function OffersSection({
  view,
  listings,
  state,
  now,
  statusOf,
  busyIds,
  onOpen,
  onSeePlans,
  onRefresh,
}: OffersSectionProps) {
  const offer = useMemo(() => planOffer(listings, statusOf), [listings, statusOf]);
  const running = planIsRunning(state, now);
  const covered = offer.waiting.length + offer.taken.length;

  if (view.loading && listings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-ink-3">
        <Spinner size={16} />
        <span className="text-sm">Fetching the catalogue…</span>
      </div>
    );
  }

  if (listings.length === 0) {
    const lines = emptyLines(view);
    return (
      <EmptyState
        icon={<Tag />}
        title={lines.title}
        description={lines.description}
        action={<Button onClick={onRefresh}>Refresh</Button>}
      />
    );
  }

  return (
    <div className="lumen-scroll flex-1 p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* The plan, stated as what it costs and what it lets through. */}
        <section
          className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4"
          aria-label="The plan"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-ink">
              {running ? 'Your plan covers' : 'A plan would cover'}{' '}
              {coverageLabel(covered, listings.length)}
            </h2>
            <span className="mono text-sm text-ink-2 tabular-nums">
              {offer.freeCount} cost nothing either way
            </span>
          </div>
          <p className="text-base text-ink-2">
            {running
              ? 'Anything below installs without paying again. The rest of the store is free either way.'
              : `${formatPrice(MONTHLY_PLAN.priceMinor)} a month, or ${formatPrice(
                  YEARLY_PLAN.priceMinor,
                )} a year — ${formatPrice(YEARLY_DISCOUNT_MINOR)} less than paying by the month.`}
          </p>
          {!running && (
            <div>
              <Button variant="primary" onClick={onSeePlans}>
                See the plans
              </Button>
            </div>
          )}
        </section>

        <Shelf
          title={running ? 'Covered, not installed yet' : 'What the plan unlocks'}
          detail={`${offer.waiting.length}`}
          listings={offer.waiting}
          statusOf={statusOf}
          busyIds={busyIds}
          onOpen={onOpen}
        />
        <Shelf
          title="Already installed on this plan"
          detail={`${offer.taken.length}`}
          listings={offer.taken}
          statusOf={statusOf}
          busyIds={busyIds}
          onOpen={onOpen}
        />

        {covered === 0 && (
          <EmptyState
            icon={<Tag />}
            title="Nothing in this store needs a plan"
            description="Every package the catalogue lists is free. A subscription would buy nothing here."
          />
        )}
      </div>
    </div>
  );
}

/**
 * What a plan is worth, from what the store actually charges for.
 *
 * The catalogue prices a package as `free` or `subscription` and nothing else,
 * so there are no sales here and no struck-through numbers: the one real offer
 * this store has is the plan, and the honest way to show it is to count what
 * the plan lets through and say what the yearly costs against the monthly.
 * Every figure below is read from the catalogue in hand or from `plans.ts`;
 * none of it is decoration.
 */

import type { AccountState } from './account';
import { isCovered } from './account';
import type { Listing, ListingStatus } from './storefront';

export interface Offer {
  /** Packages the plan covers, and this account has not installed. */
  waiting: Listing[];
  /** Packages the plan covers that are already on the system. */
  taken: Listing[];
  /** Packages that cost nothing either way. */
  freeCount: number;
}

/**
 * Split the catalogue by what a plan changes about it.
 *
 * A package already installed is not an offer any more, it is something the
 * plan has already given — worth showing, because it is the evidence that the
 * plan is doing something, but not as a thing to go and get.
 */
export function planOffer(
  listings: readonly Listing[],
  statusOf: (listing: Listing) => ListingStatus,
): Offer {
  const waiting: Listing[] = [];
  const taken: Listing[] = [];
  let freeCount = 0;
  for (const listing of listings) {
    if (listing.price !== 'subscription') {
      freeCount += 1;
      continue;
    }
    if (statusOf(listing) === 'installed') taken.push(listing);
    else waiting.push(listing);
  }
  return { waiting, taken, freeCount };
}

/** Whether the account can install what the plan covers, right now. */
export function planIsRunning(state: AccountState, now: number): boolean {
  return isCovered(state.subscription, now);
}

/**
 * "3 of 27 packages", for a line that has to say how much of the store this
 * is. The plural agrees with the total, which is the noun being counted out
 * of — "1 of 27 packages", never "1 of 27 package".
 */
export function coverageLabel(covered: number, total: number): string {
  return `${covered} of ${total} ${total === 1 ? 'package' : 'packages'}`;
}

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Identity } from './account';
import { SIGNED_OUT, signIn, subscribe, YEARLY_DISCOUNT_MINOR } from './account';
import { OffersSection } from './OffersSection';
import type { CatalogueView } from './source';
import type { Listing, ListingStatus } from './storefront';

const ADA: Identity = { id: 'ada', displayName: 'Ada' };
const CREATED = Date.parse('2026-09-01T08:00:00Z');
const NOW = Date.parse('2026-09-20T12:00:00Z');

const listing = (id: string, price: 'free' | 'subscription'): Listing =>
  ({
    id,
    kind: 'app',
    name: id,
    tagline: `${id} does something`,
    version: '1.0.0',
    publisher: 'Lumen',
    category: 'utilities',
    size: 1000,
    price,
    keywords: [],
    updated: '',
    origin: 'store',
  }) as unknown as Listing;

const VIEW: CatalogueView = {
  catalogue: null,
  base: 'https://store.example/',
  origin: 'network',
  fetchedAt: NOW,
  address: 'https://store.example/',
  error: null,
  loading: false,
  refreshing: false,
};

const CATALOGUE = [
  listing('paid-a', 'subscription'),
  listing('paid-b', 'subscription'),
  listing('gratis', 'free'),
];

function mount(
  options: {
    state?: typeof SIGNED_OUT;
    listings?: Listing[];
    statusOf?: (l: Listing) => ListingStatus;
  } = {},
) {
  const onOpen = vi.fn();
  const onSeePlans = vi.fn();
  render(
    <OffersSection
      view={VIEW}
      listings={options.listings ?? CATALOGUE}
      state={options.state ?? SIGNED_OUT}
      now={NOW}
      statusOf={options.statusOf ?? (() => 'available')}
      busyIds={new Set()}
      onOpen={onOpen}
      onSeePlans={onSeePlans}
      onRefresh={() => {}}
    />,
  );
  return { onOpen, onSeePlans };
}

const subscribed = () => subscribe(signIn(SIGNED_OUT, ADA, CREATED), 'yearly', CREATED);

describe('OffersSection', () => {
  it('counts what a plan covers against the whole catalogue', () => {
    mount();
    expect(screen.getByRole('heading', { name: /2 of 3 packages/ })).toBeVisible();
  });

  it('says what the rest of the catalogue costs, which is nothing', () => {
    mount();
    expect(screen.getByText('1 cost nothing either way')).toBeVisible();
  });

  it('prices the plan from the plans, and names the yearly saving', () => {
    mount();
    // The one real offer this store has: what a year costs against twelve months.
    expect(screen.getByText(/£12\.00 less than paying by the month/)).toBeVisible();
    expect(YEARLY_DISCOUNT_MINOR).toBe(1200);
  });

  it('sends a visitor without a plan to the plans', async () => {
    const { onSeePlans } = mount();
    await userEvent.click(screen.getByRole('button', { name: 'See the plans' }));
    expect(onSeePlans).toHaveBeenCalledTimes(1);
  });

  it('speaks in the present tense to someone who already has a plan', () => {
    mount({ state: subscribed() });
    expect(screen.getByRole('heading', { name: /Your plan covers/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'See the plans' })).not.toBeInTheDocument();
  });

  it('separates what the plan has already given from what is still waiting', () => {
    mount({
      state: subscribed(),
      statusOf: (l) => (l.id === 'paid-a' ? 'installed' : 'available'),
    });
    const waiting = within(screen.getByRole('region', { name: 'Covered, not installed yet' }));
    expect(waiting.getByText('paid-b')).toBeVisible();
    const taken = within(screen.getByRole('region', { name: 'Already installed on this plan' }));
    expect(taken.getByText('paid-a')).toBeVisible();
  });

  it('opens the package whose tile was pressed', async () => {
    const { onOpen } = mount();
    await userEvent.click(screen.getByRole('button', { name: /paid-a/ }));
    expect(onOpen).toHaveBeenCalledWith('paid-a');
  });

  it('says plainly when a plan would buy nothing at all', () => {
    mount({ listings: [listing('gratis', 'free')] });
    expect(screen.getByText('Nothing in this store needs a plan')).toBeVisible();
  });
});

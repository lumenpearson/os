import { describe, expect, it } from 'vitest';
import type { Identity } from './account';
import { cancel, SIGNED_OUT, signIn, subscribe } from './account';
import { coverageLabel, planIsRunning, planOffer } from './offers';
import type { Listing, ListingStatus } from './storefront';

const listing = (id: string, price: 'free' | 'subscription'): Listing =>
  ({ id, name: id, price, kind: 'app' }) as Listing;

const ALL_MISSING = () => 'available' as ListingStatus;

describe('planOffer', () => {
  const catalogue = [
    listing('a', 'subscription'),
    listing('b', 'subscription'),
    listing('c', 'free'),
  ];

  it('separates what the plan covers from what costs nothing anyway', () => {
    const offer = planOffer(catalogue, ALL_MISSING);
    expect(offer.waiting.map((l) => l.id)).toEqual(['a', 'b']);
    expect(offer.freeCount).toBe(1);
  });

  it('counts a covered package that is installed as taken, not as waiting', () => {
    const offer = planOffer(catalogue, (l) => (l.id === 'a' ? 'installed' : 'available'));
    expect(offer.waiting.map((l) => l.id)).toEqual(['b']);
    expect(offer.taken.map((l) => l.id)).toEqual(['a']);
  });

  it('has nothing to offer from an empty catalogue', () => {
    expect(planOffer([], ALL_MISSING)).toEqual({ waiting: [], taken: [], freeCount: 0 });
  });
});

describe('planIsRunning', () => {
  const ADA: Identity = { id: 'ada', displayName: 'Ada' };
  const CREATED = Date.parse('2026-09-01T08:00:00Z');
  const SUBSCRIBED = Date.parse('2026-09-05T09:00:00Z');
  const MID = Date.parse('2026-09-20T12:00:00Z');
  const LATER = Date.parse('2026-12-20T12:00:00Z');

  it('is false without an account', () => {
    expect(planIsRunning(SIGNED_OUT, MID)).toBe(false);
  });

  it('is false on the free tier', () => {
    expect(planIsRunning(signIn(SIGNED_OUT, ADA, CREATED), MID)).toBe(false);
  });

  it('is true inside a paid period', () => {
    const state = subscribe(signIn(SIGNED_OUT, ADA, CREATED), 'monthly', SUBSCRIBED);
    expect(planIsRunning(state, MID)).toBe(true);
  });

  it('stays true across a renewal, because a running plan renews', () => {
    const state = subscribe(signIn(SIGNED_OUT, ADA, CREATED), 'monthly', SUBSCRIBED);
    expect(planIsRunning(state, LATER)).toBe(true);
  });

  it('runs to the end of the period it was cancelled in, and no further', () => {
    const running = subscribe(signIn(SIGNED_OUT, ADA, CREATED), 'monthly', SUBSCRIBED);
    const cancelled = cancel(running, MID);
    expect(planIsRunning(cancelled, MID)).toBe(true);
    expect(planIsRunning(cancelled, LATER)).toBe(false);
  });
});

describe('coverageLabel', () => {
  it('counts in words a person would use', () => {
    expect(coverageLabel(1, 27)).toBe('1 of 27 packages');
    expect(coverageLabel(3, 27)).toBe('3 of 27 packages');
    expect(coverageLabel(1, 1)).toBe('1 of 1 package');
  });
});

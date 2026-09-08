/**
 * The plans on offer, and the arithmetic behind their prices.
 *
 * No money moves anywhere: this is a made-up store, and the prices exist so
 * the storefront has real numbers to print. They are integers in minor units
 * (pence), never floats, and the year's price is derived from the month's
 * rather than typed in beside it, so the two can never drift apart.
 */

import type { CurrencyCode, PaidPlanId, Plan, PlanId } from './types';

/** Every price is in this currency. */
export const CURRENCY: CurrencyCode = 'GBP';
export const CURRENCY_SYMBOL = '£';

/** The monthly plan: 500p, i.e. £5.00 a month. */
export const MONTHLY_PRICE_MINOR = 500;

/** Paying a year up front takes a fifth off. */
export const YEARLY_DISCOUNT_PERCENT = 20;

/** Twelve monthly payments: 500 * 12 = 6000p (£60.00). */
export const TWELVE_MONTHS_MINOR = MONTHLY_PRICE_MINOR * 12;

/** What the discount is worth: 20% of 6000 = 1200p (£12.00). */
export const YEARLY_DISCOUNT_MINOR = (TWELVE_MONTHS_MINOR * YEARLY_DISCOUNT_PERCENT) / 100;

/** 6000 - 1200 = 4800p: £48.00 a year, which works out at £4.00 a month. */
export const YEARLY_PRICE_MINOR = TWELVE_MONTHS_MINOR - YEARLY_DISCOUNT_MINOR;

/** `500` becomes `£5.00`. Minor units in, one string out, no locale involved. */
export function formatPrice(minor: number): string {
  return `${CURRENCY_SYMBOL}${(minor / 100).toFixed(2)}`;
}

export const FREE_PLAN: Plan = {
  id: 'free',
  name: 'Free',
  summary: 'Everything the catalogue prices at free, and nothing else.',
  priceMinor: 0,
  currency: CURRENCY,
  period: null,
  unlocksSubscriptions: false,
  includes: [
    'Install any package priced free',
    'Keep everything you install',
    'One account, held on this machine',
  ],
};

export const MONTHLY_PLAN: Plan = {
  id: 'monthly',
  name: 'Monthly',
  summary: 'The whole catalogue, charged every month.',
  priceMinor: MONTHLY_PRICE_MINOR,
  currency: CURRENCY,
  period: 'month',
  unlocksSubscriptions: true,
  includes: [
    'Install any package, free or subscription',
    'What you install stays installed after you cancel',
    'Cancel whenever you like; the month you paid for runs out',
  ],
};

export const YEARLY_PLAN: Plan = {
  id: 'yearly',
  name: 'Yearly',
  summary: 'The same catalogue, paid a year at a time, a fifth cheaper.',
  priceMinor: YEARLY_PRICE_MINOR,
  currency: CURRENCY,
  period: 'year',
  unlocksSubscriptions: true,
  includes: [
    'Everything in Monthly',
    `${formatPrice(YEARLY_PRICE_MINOR)} a year rather than ${formatPrice(TWELVE_MONTHS_MINOR)}`,
    `${formatPrice(YEARLY_PRICE_MINOR / 12)} a month, saving ${formatPrice(YEARLY_DISCOUNT_MINOR)}`,
  ],
};

/** In the order the storefront shows them. */
export const PLANS: readonly Plan[] = [FREE_PLAN, MONTHLY_PLAN, YEARLY_PLAN];

/** Total in its key, so a known plan id always resolves to a plan. */
export const PLANS_BY_ID: Record<PlanId, Plan> = {
  free: FREE_PLAN,
  monthly: MONTHLY_PLAN,
  yearly: YEARLY_PLAN,
};

/** The plan a known id names. */
export function plan(id: PlanId): Plan {
  return PLANS_BY_ID[id];
}

/** The plan an unchecked string names, if any. */
export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** How many months one period covers; the free tier has no period. */
export function periodMonths(p: Plan): number | null {
  if (p.period === 'month') return 1;
  if (p.period === 'year') return 12;
  return null;
}

/** What the plan costs a month, for comparing a year's price with a month's. */
export function monthlyEquivalentMinor(p: Plan): number {
  const months = periodMonths(p);
  return months === null ? 0 : Math.round(p.priceMinor / months);
}

/** What the plan saves against paying monthly for the same time. */
export function savingMinor(p: Plan): number {
  const months = periodMonths(p);
  if (months === null) return 0;
  return MONTHLY_PRICE_MINOR * months - p.priceMinor;
}

/**
 * `from` plus `count` months, in UTC, keeping the time of day. A day the
 * target month does not have moves back to its last day, so 31 January plus a
 * month is 28 February rather than spilling into March.
 */
export function addMonths(from: number, count: number): number {
  const start = new Date(from);
  const day = start.getUTCDate();
  const target = new Date(from);
  // Move off the day first: setUTCMonth on the 31st would roll the month over
  // before the day is clamped.
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + count);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/** When a period beginning at `from` next charges. */
export function nextRenewal(id: PaidPlanId, from: number): number {
  return addMonths(from, id === 'yearly' ? 12 : 1);
}

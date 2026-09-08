import { describe, expect, it } from 'vitest';
import {
  addMonths,
  CURRENCY,
  FREE_PLAN,
  formatPrice,
  MONTHLY_PLAN,
  MONTHLY_PRICE_MINOR,
  monthlyEquivalentMinor,
  nextRenewal,
  PLANS,
  periodMonths,
  plan,
  planById,
  savingMinor,
  TWELVE_MONTHS_MINOR,
  YEARLY_DISCOUNT_MINOR,
  YEARLY_DISCOUNT_PERCENT,
  YEARLY_PLAN,
  YEARLY_PRICE_MINOR,
} from './plans';
import { PLAN_IDS } from './types';

describe('prices', () => {
  it('charges £5.00 a month', () => {
    expect(MONTHLY_PRICE_MINOR).toBe(500);
    expect(formatPrice(MONTHLY_PRICE_MINOR)).toBe('£5.00');
  });

  it('takes a fifth off twelve months of the monthly price', () => {
    expect(TWELVE_MONTHS_MINOR).toBe(MONTHLY_PRICE_MINOR * 12);
    expect(TWELVE_MONTHS_MINOR).toBe(6000);
    expect(YEARLY_DISCOUNT_PERCENT).toBe(20);
    expect(YEARLY_DISCOUNT_MINOR).toBe((6000 * 20) / 100);
    expect(YEARLY_DISCOUNT_MINOR).toBe(1200);
    expect(YEARLY_PRICE_MINOR).toBe(TWELVE_MONTHS_MINOR - YEARLY_DISCOUNT_MINOR);
    expect(YEARLY_PRICE_MINOR).toBe(4800);
    expect(formatPrice(YEARLY_PRICE_MINOR)).toBe('£48.00');
  });

  it('keeps every price a whole number of pence', () => {
    for (const p of PLANS) expect(Number.isInteger(p.priceMinor)).toBe(true);
    expect(Number.isInteger(YEARLY_DISCOUNT_MINOR)).toBe(true);
  });

  it('works the yearly plan out at £4.00 a month', () => {
    expect(monthlyEquivalentMinor(YEARLY_PLAN)).toBe(400);
    expect(monthlyEquivalentMinor(MONTHLY_PLAN)).toBe(MONTHLY_PRICE_MINOR);
    expect(monthlyEquivalentMinor(FREE_PLAN)).toBe(0);
  });

  it('saves a year of subscribers the discount and no more', () => {
    expect(savingMinor(YEARLY_PLAN)).toBe(YEARLY_DISCOUNT_MINOR);
    expect(savingMinor(MONTHLY_PLAN)).toBe(0);
    expect(savingMinor(FREE_PLAN)).toBe(0);
  });

  it('prices everything in one currency', () => {
    for (const p of PLANS) expect(p.currency).toBe(CURRENCY);
  });
});

describe('the plans on offer', () => {
  it('resolves every plan id to a plan', () => {
    for (const id of PLAN_IDS) expect(plan(id).id).toBe(id);
    expect(PLANS.map((p) => p.id)).toEqual([...PLAN_IDS]);
  });

  it('finds a plan by an unchecked string, or nothing', () => {
    expect(planById('yearly')).toBe(YEARLY_PLAN);
    expect(planById('platinum')).toBeUndefined();
  });

  it('unlocks subscription packages on the paid plans only', () => {
    expect(FREE_PLAN.unlocksSubscriptions).toBe(false);
    expect(MONTHLY_PLAN.unlocksSubscriptions).toBe(true);
    expect(YEARLY_PLAN.unlocksSubscriptions).toBe(true);
  });

  it('gives the free tier no period, so it never renews', () => {
    expect(FREE_PLAN.period).toBeNull();
    expect(periodMonths(FREE_PLAN)).toBeNull();
    expect(periodMonths(MONTHLY_PLAN)).toBe(1);
    expect(periodMonths(YEARLY_PLAN)).toBe(12);
  });

  it('says what each plan includes', () => {
    for (const p of PLANS) {
      expect(p.includes.length).toBeGreaterThan(0);
      expect(p.summary.length).toBeGreaterThan(0);
    }
  });
});

describe('addMonths', () => {
  const at = (iso: string) => Date.parse(iso);

  it('keeps the day and the time of day', () => {
    expect(addMonths(at('2026-01-10T12:00:00Z'), 1)).toBe(at('2026-02-10T12:00:00Z'));
    expect(addMonths(at('2026-01-10T12:00:00Z'), 12)).toBe(at('2027-01-10T12:00:00Z'));
  });

  it('moves back to the last day of a shorter month', () => {
    expect(addMonths(at('2026-01-31T09:00:00Z'), 1)).toBe(at('2026-02-28T09:00:00Z'));
    expect(addMonths(at('2026-08-31T09:00:00Z'), 1)).toBe(at('2026-09-30T09:00:00Z'));
  });

  it('moves the 29th of February back in a year that has no leap day', () => {
    expect(addMonths(at('2028-02-29T00:00:00Z'), 12)).toBe(at('2029-02-28T00:00:00Z'));
  });

  it('crosses the end of the year', () => {
    expect(addMonths(at('2026-12-15T00:00:00Z'), 1)).toBe(at('2027-01-15T00:00:00Z'));
  });
});

describe('nextRenewal', () => {
  const started = Date.parse('2026-09-05T08:00:00Z');

  it('charges the monthly plan a month later', () => {
    expect(nextRenewal('monthly', started)).toBe(Date.parse('2026-10-05T08:00:00Z'));
  });

  it('charges the yearly plan a year later', () => {
    expect(nextRenewal('yearly', started)).toBe(Date.parse('2027-09-05T08:00:00Z'));
  });
});

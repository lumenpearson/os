import { describe, expect, it } from 'vitest';
import {
  isCurrencyCode,
  isPackagePrice,
  isPaidPlanId,
  isPlanId,
  isReceiptKind,
  isSubscriptionState,
  PAID_PLAN_IDS,
  PLAN_IDS,
  SIGNED_OUT,
} from './types';

describe('plan ids', () => {
  it('offers a free tier and two paid plans', () => {
    expect([...PLAN_IDS]).toEqual(['free', 'monthly', 'yearly']);
  });

  it('counts every paid plan as a plan, and the free tier as neither', () => {
    for (const id of PAID_PLAN_IDS) {
      expect(isPlanId(id)).toBe(true);
      expect(isPaidPlanId(id)).toBe(true);
    }
    expect(isPlanId('free')).toBe(true);
    expect(isPaidPlanId('free')).toBe(false);
  });

  it('refuses anything that is not a plan id', () => {
    for (const value of ['', 'gold', 'MONTHLY', 0, null, undefined, {}]) {
      expect(isPlanId(value)).toBe(false);
      expect(isPaidPlanId(value)).toBe(false);
    }
  });
});

describe('value guards', () => {
  it('reads the two subscription states and nothing else', () => {
    expect(isSubscriptionState('active')).toBe(true);
    expect(isSubscriptionState('cancelled')).toBe(true);
    expect(isSubscriptionState('lapsed')).toBe(false);
    expect(isSubscriptionState(null)).toBe(false);
  });

  it('reads the catalogue prices in store/FORMAT.md', () => {
    expect(isPackagePrice('free')).toBe(true);
    expect(isPackagePrice('subscription')).toBe(true);
    expect(isPackagePrice('paid')).toBe(false);
  });

  it('reads receipt kinds and the one currency', () => {
    expect(isReceiptKind('subscription')).toBe(true);
    expect(isReceiptKind('package')).toBe(true);
    expect(isReceiptKind('refund')).toBe(false);
    expect(isCurrencyCode('GBP')).toBe(true);
    expect(isCurrencyCode('USD')).toBe(false);
  });
});

describe('SIGNED_OUT', () => {
  it('holds no account, no plan and nothing bought', () => {
    expect(SIGNED_OUT).toEqual({
      account: null,
      subscription: null,
      purchases: [],
      receipts: [],
    });
  });
});

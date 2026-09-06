import { describe, expect, it } from 'vitest';
import {
  cancel,
  currentPlan,
  installReason,
  isCovered,
  mayInstall,
  ownsPackage,
  purchaseOf,
  recordPurchase,
  renewSubscription,
  signIn,
  signOut,
  subscribe,
  subscriptionStatus,
} from './account';
import { MONTHLY_PRICE_MINOR, YEARLY_PRICE_MINOR } from './plans';
import type { AccountState, Identity, PaidPlanId, VersionedPackage } from './types';
import { SIGNED_OUT } from './types';

/** Fixed moments, so nothing here depends on when the tests run. */
const CREATED = Date.parse('2026-09-01T08:00:00Z');
const SUBSCRIBED_AT = Date.parse('2026-09-05T09:00:00Z');
const RENEWS_AT = Date.parse('2026-10-05T09:00:00Z');
const MID_PERIOD = Date.parse('2026-09-20T12:00:00Z');
const AFTER_RENEWAL = Date.parse('2026-10-06T12:00:00Z');

const ADA: Identity = { id: 'acct-ada', displayName: 'Ada' };
const GRACE: Identity = { id: 'acct-grace', displayName: 'Grace' };

const FREE_PACKAGE: VersionedPackage = {
  id: 'com.lumen.pomodoro',
  version: '1.2.0',
  price: 'free',
};
const PAID_PACKAGE: VersionedPackage = {
  id: 'com.lumen.atlas',
  version: '2.0.0',
  price: 'subscription',
};

function signedIn(): AccountState {
  return signIn(SIGNED_OUT, ADA, CREATED);
}

function subscribed(planId: PaidPlanId = 'monthly'): AccountState {
  return subscribe(signedIn(), planId, SUBSCRIBED_AT);
}

describe('signIn and signOut', () => {
  it('makes an account stamped with the moment it was made', () => {
    const state = signedIn();
    expect(state.account).toEqual({ id: ADA.id, displayName: 'Ada', created: CREATED });
    expect(state.subscription).toBeNull();
    expect(state.purchases).toEqual([]);
  });

  it('keeps what the same account holds, and takes the new name', () => {
    const state = recordPurchase(subscribed(), PAID_PACKAGE, MID_PERIOD);
    const again = signIn(state, { id: ADA.id, displayName: 'Ada L' }, AFTER_RENEWAL);
    expect(again.account?.displayName).toBe('Ada L');
    expect(again.account?.created).toBe(CREATED);
    expect(again.subscription).toEqual(state.subscription);
    expect(again.purchases).toEqual(state.purchases);
  });

  it('starts from nothing when another account signs in', () => {
    const state = recordPurchase(subscribed(), PAID_PACKAGE, MID_PERIOD);
    const other = signIn(state, GRACE, AFTER_RENEWAL);
    expect(other.account?.id).toBe(GRACE.id);
    expect(other.subscription).toBeNull();
    expect(other.purchases).toEqual([]);
    expect(other.receipts).toEqual([]);
  });

  it('discards the account, the plan and the purchases', () => {
    expect(signOut()).toEqual(SIGNED_OUT);
  });
});

describe('subscribe', () => {
  it('does nothing while signed out', () => {
    expect(subscribe(SIGNED_OUT, 'monthly', SUBSCRIBED_AT)).toEqual(SIGNED_OUT);
  });

  it('runs a monthly plan from now to a month from now', () => {
    const state = subscribed();
    expect(state.subscription).toEqual({
      planId: 'monthly',
      started: SUBSCRIBED_AT,
      renews: RENEWS_AT,
      state: 'active',
      cancelled: null,
    });
  });

  it('runs a yearly plan for a year', () => {
    const state = subscribed('yearly');
    expect(state.subscription?.renews).toBe(Date.parse('2027-09-05T09:00:00Z'));
  });

  it('writes a receipt for the period it charged', () => {
    expect(subscribed().receipts).toEqual([
      {
        id: `subscription-monthly-${SUBSCRIBED_AT}`,
        kind: 'subscription',
        item: 'monthly',
        description: 'Monthly plan, one month',
        amountMinor: MONTHLY_PRICE_MINOR,
        currency: 'GBP',
        when: SUBSCRIBED_AT,
      },
    ]);
    expect(subscribed('yearly').receipts[0]?.amountMinor).toBe(YEARLY_PRICE_MINOR);
  });

  it('charges nothing to subscribe to the plan already running', () => {
    const state = subscribed();
    expect(subscribe(state, 'monthly', MID_PERIOD)).toBe(state);
  });

  it('restarts a cancelled plan inside its period without charging again', () => {
    const state = subscribe(cancel(subscribed(), MID_PERIOD), 'monthly', MID_PERIOD);
    expect(state.subscription).toEqual({
      planId: 'monthly',
      started: SUBSCRIBED_AT,
      renews: RENEWS_AT,
      state: 'active',
      cancelled: null,
    });
    expect(state.receipts).toHaveLength(1);
  });

  it('charges again once the cancelled period has run out', () => {
    const state = subscribe(cancel(subscribed(), MID_PERIOD), 'monthly', AFTER_RENEWAL);
    expect(state.subscription?.started).toBe(AFTER_RENEWAL);
    expect(state.receipts).toHaveLength(2);
  });

  it('starts a new period when the plan changes', () => {
    const state = subscribe(subscribed(), 'yearly', MID_PERIOD);
    expect(state.subscription?.planId).toBe('yearly');
    expect(state.subscription?.started).toBe(MID_PERIOD);
    expect(state.receipts.map((r) => r.item)).toEqual(['monthly', 'yearly']);
  });
});

describe('cancel', () => {
  it('leaves the subscription running to its renewal date', () => {
    const state = cancel(subscribed(), MID_PERIOD);
    expect(state.subscription).toEqual({
      planId: 'monthly',
      started: SUBSCRIBED_AT,
      renews: RENEWS_AT,
      state: 'cancelled',
      cancelled: MID_PERIOD,
    });
  });

  it('changes nothing when there is no plan, or it is already cancelled', () => {
    expect(cancel(signedIn(), MID_PERIOD).subscription).toBeNull();
    const cancelled = cancel(subscribed(), MID_PERIOD);
    expect(cancel(cancelled, AFTER_RENEWAL)).toBe(cancelled);
  });

  it('takes no money back: the receipts stand', () => {
    expect(cancel(subscribed(), MID_PERIOD).receipts).toHaveLength(1);
  });
});

describe('subscriptionStatus', () => {
  it('reads none, active, cancelling and lapsed', () => {
    const active = subscribed().subscription;
    expect(subscriptionStatus(null, MID_PERIOD)).toBe('none');
    expect(subscriptionStatus(active, MID_PERIOD)).toBe('active');
    const cancelled = cancel(subscribed(), MID_PERIOD).subscription;
    expect(subscriptionStatus(cancelled, MID_PERIOD)).toBe('cancelling');
    expect(subscriptionStatus(cancelled, AFTER_RENEWAL)).toBe('lapsed');
  });

  it('holds an active plan open past its date, because it renews itself', () => {
    expect(subscriptionStatus(subscribed().subscription, AFTER_RENEWAL)).toBe('active');
  });

  it('ends cover exactly on the renewal date', () => {
    const cancelled = cancel(subscribed(), MID_PERIOD).subscription;
    expect(isCovered(cancelled, RENEWS_AT - 1)).toBe(true);
    expect(isCovered(cancelled, RENEWS_AT)).toBe(false);
  });
});

describe('currentPlan', () => {
  it('is the free tier without a plan, and once one has lapsed', () => {
    expect(currentPlan(signedIn(), MID_PERIOD).id).toBe('free');
    const cancelled = cancel(subscribed(), MID_PERIOD);
    expect(currentPlan(cancelled, MID_PERIOD).id).toBe('monthly');
    expect(currentPlan(cancelled, AFTER_RENEWAL).id).toBe('free');
  });
});

describe('mayInstall', () => {
  it('installs a free package without an account', () => {
    expect(mayInstall(SIGNED_OUT, FREE_PACKAGE, MID_PERIOD)).toBe(true);
    expect(installReason(SIGNED_OUT, FREE_PACKAGE, MID_PERIOD)).toBe('free');
  });

  it('refuses a subscription package to nobody in particular', () => {
    expect(installReason(SIGNED_OUT, PAID_PACKAGE, MID_PERIOD)).toBe('signed-out');
    expect(mayInstall(SIGNED_OUT, PAID_PACKAGE, MID_PERIOD)).toBe(false);
  });

  it('refuses a subscription package to an account on the free tier', () => {
    expect(installReason(signedIn(), PAID_PACKAGE, MID_PERIOD)).toBe('not-subscribed');
  });

  it('allows one to a subscriber', () => {
    expect(installReason(subscribed(), PAID_PACKAGE, MID_PERIOD)).toBe('covered');
    expect(mayInstall(subscribed(), PAID_PACKAGE, MID_PERIOD)).toBe(true);
  });

  it('keeps allowing one after cancelling, until the renewal date', () => {
    const cancelled = cancel(subscribed(), MID_PERIOD);
    expect(mayInstall(cancelled, PAID_PACKAGE, MID_PERIOD)).toBe(true);
    expect(mayInstall(cancelled, PAID_PACKAGE, RENEWS_AT - 1)).toBe(true);
    expect(installReason(cancelled, PAID_PACKAGE, RENEWS_AT - 1)).toBe('covered');
  });

  it('refuses one on a lapsed subscription', () => {
    const cancelled = cancel(subscribed(), MID_PERIOD);
    expect(mayInstall(cancelled, PAID_PACKAGE, RENEWS_AT)).toBe(false);
    expect(installReason(cancelled, PAID_PACKAGE, AFTER_RENEWAL)).toBe('not-subscribed');
    // A free package is still a free package to a lapsed account.
    expect(mayInstall(cancelled, FREE_PACKAGE, AFTER_RENEWAL)).toBe(true);
  });

  it('allows a package bought while subscribed after the subscription lapses', () => {
    const bought = recordPurchase(subscribed(), PAID_PACKAGE, MID_PERIOD);
    const lapsed = cancel(bought, MID_PERIOD);
    expect(ownsPackage(lapsed, PAID_PACKAGE.id)).toBe(true);
    expect(installReason(lapsed, PAID_PACKAGE, AFTER_RENEWAL)).toBe('owned');
    expect(mayInstall(lapsed, PAID_PACKAGE, AFTER_RENEWAL)).toBe(true);
    // Ownership is per package: the rest of the catalogue is closed again.
    const other = { ...PAID_PACKAGE, id: 'com.lumen.other' };
    expect(mayInstall(lapsed, other, AFTER_RENEWAL)).toBe(false);
  });
});

describe('recordPurchase', () => {
  it('does nothing while signed out', () => {
    expect(recordPurchase(SIGNED_OUT, FREE_PACKAGE, MID_PERIOD)).toEqual(SIGNED_OUT);
  });

  it('refuses what the account could not install', () => {
    const state = signedIn();
    expect(recordPurchase(state, PAID_PACKAGE, MID_PERIOD)).toBe(state);
  });

  it('records the package, the version and the moment', () => {
    const state = recordPurchase(signedIn(), FREE_PACKAGE, MID_PERIOD);
    expect(purchaseOf(state, FREE_PACKAGE.id)).toEqual({
      packageId: FREE_PACKAGE.id,
      version: '1.2.0',
      when: MID_PERIOD,
    });
  });

  it('writes a receipt saying how the package was come by', () => {
    const free = recordPurchase(signedIn(), FREE_PACKAGE, MID_PERIOD).receipts[0];
    expect(free).toMatchObject({
      kind: 'package',
      item: FREE_PACKAGE.id,
      description: 'Version 1.2.0, free',
      amountMinor: 0,
    });
    const paid = recordPurchase(subscribed(), PAID_PACKAGE, MID_PERIOD).receipts[1];
    expect(paid).toMatchObject({
      description: 'Version 2.0.0, included with Monthly',
      amountMinor: 0,
    });
  });

  it('keeps one row per package, at the version last taken', () => {
    const first = recordPurchase(signedIn(), FREE_PACKAGE, CREATED);
    const second = recordPurchase(first, { ...FREE_PACKAGE, version: '1.3.0' }, MID_PERIOD);
    expect(second.purchases).toHaveLength(1);
    expect(purchaseOf(second, FREE_PACKAGE.id)?.version).toBe('1.3.0');
    // The history keeps both, even though the shelf holds one.
    expect(second.receipts).toHaveLength(2);
  });

  it('survives cancelling the subscription that paid for it', () => {
    const bought = recordPurchase(subscribed(), PAID_PACKAGE, MID_PERIOD);
    const cancelled = cancel(bought, MID_PERIOD);
    expect(cancelled.purchases).toEqual(bought.purchases);
    expect(purchaseOf(cancelled, PAID_PACKAGE.id)?.when).toBe(MID_PERIOD);
  });
});

describe('renewSubscription', () => {
  it('leaves a plan alone before its date', () => {
    const state = subscribed();
    expect(renewSubscription(state, MID_PERIOD)).toBe(state);
  });

  it('rolls an active plan past every period that has ended', () => {
    const state = renewSubscription(subscribed(), Date.parse('2026-12-06T00:00:00Z'));
    expect(state.subscription?.renews).toBe(Date.parse('2027-01-05T09:00:00Z'));
    // One receipt for the first month, then one for each period charged since.
    expect(state.receipts).toHaveLength(4);
    expect(state.receipts.every((r) => r.amountMinor === MONTHLY_PRICE_MINOR)).toBe(true);
  });

  it('gives each renewal its own receipt id', () => {
    const state = renewSubscription(subscribed(), Date.parse('2026-12-06T00:00:00Z'));
    expect(new Set(state.receipts.map((r) => r.id)).size).toBe(state.receipts.length);
  });

  it('does not renew a cancelled plan, before or after its date', () => {
    const cancelled = cancel(subscribed(), MID_PERIOD);
    expect(renewSubscription(cancelled, AFTER_RENEWAL)).toBe(cancelled);
    expect(subscriptionStatus(cancelled.subscription, AFTER_RENEWAL)).toBe('lapsed');
  });

  it('leaves a signed-out state alone', () => {
    expect(renewSubscription(SIGNED_OUT, AFTER_RENEWAL)).toBe(SIGNED_OUT);
  });

  it('stops after a bounded number of periods when the clock jumps years', () => {
    const state = renewSubscription(subscribed(), Date.parse('2126-09-05T09:00:00Z'));
    // The first month's charge, plus the bounded run of renewals after it.
    expect(state.receipts).toHaveLength(121);
    expect(state.subscription?.renews).toBe(Date.parse('2036-10-05T09:00:00Z'));
  });
});

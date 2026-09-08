/**
 * Every change the storefront can make to the account, as a pure function
 * from one state to the next.
 *
 * A made-up account for a made-up store: signing in writes a record to a file,
 * subscribing charges nobody, and no request leaves the machine. `now` is an
 * argument to everything that involves a date — nothing here reads the clock —
 * so a renewal can be tested from either side of it.
 */

import { CURRENCY, nextRenewal, PLANS_BY_ID } from './plans';
import type {
  AccountState,
  Identity,
  InstallReason,
  PaidPlanId,
  Plan,
  PricedPackage,
  Purchase,
  Receipt,
  Subscription,
  SubscriptionStatus,
  VersionedPackage,
} from './types';
import { SIGNED_OUT } from './types';

/**
 * How many periods one call to `renewSubscription` will roll through. A clock
 * set far into the future would otherwise spin; ten years of monthly periods
 * is more history than the storefront has any use for.
 */
const MAX_RENEWALS = 120;

/** Ids are derived from the line, so no receipt needs a random number. */
function receiptId(kind: Receipt['kind'], item: string, when: number): string {
  return `${kind}-${item}-${when}`;
}

function subscriptionReceipt(p: Plan, when: number): Receipt {
  return {
    id: receiptId('subscription', p.id, when),
    kind: 'subscription',
    item: p.id,
    description: `${p.name} plan, ${p.period === 'year' ? 'one year' : 'one month'}`,
    amountMinor: p.priceMinor,
    currency: p.currency,
    when,
  };
}

function purchaseDescription(reason: InstallReason, p: Plan, version: string): string {
  if (reason === 'free') return `Version ${version}, free`;
  if (reason === 'owned') return `Version ${version}, already bought`;
  return `Version ${version}, included with ${p.name}`;
}

function packageReceipt(
  pkg: VersionedPackage,
  reason: InstallReason,
  p: Plan,
  when: number,
): Receipt {
  return {
    id: receiptId('package', pkg.id, when),
    kind: 'package',
    item: pkg.id,
    description: purchaseDescription(reason, p, pkg.version),
    // A package costs a plan, not money: the subscription line is the charge.
    amountMinor: 0,
    currency: CURRENCY,
    when,
  };
}

/**
 * Where a subscription stands at `now`. An active subscription reads as active
 * even past its renewal date, because an active subscription renews itself;
 * `renewSubscription` is what moves the date on.
 */
export function subscriptionStatus(
  subscription: Subscription | null,
  now: number,
): SubscriptionStatus {
  if (!subscription) return 'none';
  if (subscription.state === 'active') return 'active';
  return now < subscription.renews ? 'cancelling' : 'lapsed';
}

/** Whether a plan is paying for this moment, cancelled or not. */
export function isCovered(subscription: Subscription | null, now: number): boolean {
  const status = subscriptionStatus(subscription, now);
  return status === 'active' || status === 'cancelling';
}

/** The plan in force at `now`: the free tier once a subscription has lapsed. */
export function currentPlan(state: AccountState, now: number): Plan {
  const subscription = state.subscription;
  if (!subscription || !isCovered(subscription, now)) return PLANS_BY_ID.free;
  return PLANS_BY_ID[subscription.planId];
}

export function purchaseOf(state: AccountState, packageId: string): Purchase | undefined {
  return state.purchases.find((p) => p.packageId === packageId);
}

export function ownsPackage(state: AccountState, packageId: string): boolean {
  return purchaseOf(state, packageId) !== undefined;
}

/**
 * Why the storefront may or may not offer Install. A free package needs no
 * account at all; a subscription package needs one, and either a plan covering
 * `now` or a purchase already recorded — what an account has bought stays
 * bought after the plan lapses.
 */
export function installReason(state: AccountState, pkg: PricedPackage, now: number): InstallReason {
  if (pkg.price === 'free') return 'free';
  if (!state.account) return 'signed-out';
  if (ownsPackage(state, pkg.id)) return 'owned';
  return isCovered(state.subscription, now) ? 'covered' : 'not-subscribed';
}

function allows(reason: InstallReason): boolean {
  return reason === 'free' || reason === 'owned' || reason === 'covered';
}

/** The predicate the storefront asks before it offers Install. */
export function mayInstall(state: AccountState, pkg: PricedPackage, now: number): boolean {
  return allows(installReason(state, pkg, now));
}

/**
 * Sign in. Signing in as the same account keeps what it holds and only takes
 * the new display name; any other id starts from nothing, because purchases
 * belong to an account rather than to the machine.
 */
export function signIn(state: AccountState, identity: Identity, now: number): AccountState {
  const current = state.account;
  if (current && current.id === identity.id) {
    return { ...state, account: { ...current, displayName: identity.displayName } };
  }
  return {
    ...SIGNED_OUT,
    account: { id: identity.id, displayName: identity.displayName, created: now },
  };
}

/**
 * Sign out. The file is the account — there is no server holding a copy — so
 * signing out discards the subscription and the purchases with it.
 */
export function signOut(): AccountState {
  return SIGNED_OUT;
}

/**
 * Take out a plan. Subscribing to the plan already running changes nothing, and
 * restarting one cancelled inside its paid period only clears the cancellation:
 * neither charges twice.
 */
export function subscribe(state: AccountState, planId: PaidPlanId, now: number): AccountState {
  if (!state.account) return state;
  const current = state.subscription;
  if (current && current.planId === planId) {
    if (current.state === 'active') return state;
    if (now < current.renews) {
      return { ...state, subscription: { ...current, state: 'active', cancelled: null } };
    }
  }
  const p = PLANS_BY_ID[planId];
  return {
    ...state,
    subscription: {
      planId,
      started: now,
      renews: nextRenewal(planId, now),
      state: 'active',
      cancelled: null,
    },
    receipts: [...state.receipts, subscriptionReceipt(p, now)],
  };
}

/**
 * Cancel. This stops the next charge; it does not take back the period already
 * paid for, so `renews` stands and becomes the date access ends.
 */
export function cancel(state: AccountState, now: number): AccountState {
  const current = state.subscription;
  if (!current || current.state === 'cancelled') return state;
  return { ...state, subscription: { ...current, state: 'cancelled', cancelled: now } };
}

/**
 * Record what an account acquired. One purchase is kept per package — a later
 * version replaces the earlier row — while the receipts keep the history.
 *
 * The storefront asks `mayInstall` first; refusing again here keeps a
 * subscription package out of the history of an account that cannot install it.
 */
export function recordPurchase(
  state: AccountState,
  pkg: VersionedPackage,
  now: number,
): AccountState {
  if (!state.account) return state;
  const reason = installReason(state, pkg, now);
  if (!allows(reason)) return state;
  const purchase: Purchase = { packageId: pkg.id, version: pkg.version, when: now };
  const kept = state.purchases.filter((p) => p.packageId !== pkg.id);
  return {
    ...state,
    purchases: [...kept, purchase],
    receipts: [...state.receipts, packageReceipt(pkg, reason, currentPlan(state, now), now)],
  };
}

/**
 * Roll an active subscription forward over every period that has ended, with a
 * receipt for each. The storefront calls this when it opens: a subscription
 * left running while the machine was off should come back with its next date
 * ahead of now rather than behind it. A cancelled subscription is left alone —
 * not renewing is the whole of what cancelling did.
 */
export function renewSubscription(state: AccountState, now: number): AccountState {
  const current = state.subscription;
  if (!current) return state;
  if (current.state !== 'active' || now < current.renews) return state;
  const p = PLANS_BY_ID[current.planId];
  const receipts = [...state.receipts];
  let renews = current.renews;
  for (let i = 0; renews <= now && i < MAX_RENEWALS; i += 1) {
    receipts.push(subscriptionReceipt(p, renews));
    renews = nextRenewal(current.planId, renews);
  }
  return { ...state, subscription: { ...current, renews }, receipts };
}

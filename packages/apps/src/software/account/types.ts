/**
 * The shapes of the store account.
 *
 * A made-up account for a made-up store. It authenticates against nothing,
 * sends nothing anywhere, and keeps its whole state in one JSON file under the
 * user's home, so the storefront can show what a real account would — a plan,
 * a renewal date, a history of what was bought — without pretending to be one.
 *
 * Every time here is milliseconds since the Unix epoch, the unit `Date.now()`
 * returns: a date is then compared as a number, and a corrupt one is caught by
 * `Number.isFinite` rather than by parsing a string twice.
 */

/** The plans on offer. `free` is what an account has when it pays nothing. */
export const PLAN_IDS = ['free', 'monthly', 'yearly'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** The plans that can be subscribed to; the free tier is the absence of one. */
export const PAID_PLAN_IDS = ['monthly', 'yearly'] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

export function isPlanId(value: unknown): value is PlanId {
  return PLAN_IDS.some((id) => id === value);
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return PAID_PLAN_IDS.some((id) => id === value);
}

/** How long one billing period lasts. */
export type PlanPeriod = 'month' | 'year';

/** The store prices in one currency; there is no exchange rate to get wrong. */
export const CURRENCY_CODES = ['GBP'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return CURRENCY_CODES.some((code) => code === value);
}

export interface Plan {
  id: PlanId;
  name: string;
  /** One sentence, for the plan card. */
  summary: string;
  /** One period's price in minor units (pence). Zero on the free tier. */
  priceMinor: number;
  currency: CurrencyCode;
  /** The free tier never renews, so it has no period. */
  period: PlanPeriod | null;
  /** Whether the plan unlocks packages whose catalogue `price` is `subscription`. */
  unlocksSubscriptions: boolean;
  /** What the plan includes, one short line each. */
  includes: readonly string[];
}

export interface Account {
  /** Made on this machine and checked by nobody: any non-empty string will do. */
  id: string;
  displayName: string;
  created: number;
}

/**
 * Who is signing in. The id comes from the caller — `crypto.randomUUID()` at
 * the edge — so the reducers need no source of randomness of their own.
 */
export interface Identity {
  id: string;
  displayName: string;
}

export const SUBSCRIPTION_STATES = ['active', 'cancelled'] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export function isSubscriptionState(value: unknown): value is SubscriptionState {
  return SUBSCRIPTION_STATES.some((state) => state === value);
}

export interface Subscription {
  planId: PaidPlanId;
  /** When this run of the plan began. */
  started: number;
  /** When it charges next, or — once cancelled — when access ends. */
  renews: number;
  state: SubscriptionState;
  /** When it was cancelled; null while it is active. */
  cancelled: number | null;
}

/**
 * `active` renews itself, `cancelling` runs to its renewal date and stops,
 * `lapsed` is past that date. Nothing stores `lapsed`: it is a fact about the
 * moment you ask, not a state a subscription is put into.
 */
export type SubscriptionStatus = 'none' | 'active' | 'cancelling' | 'lapsed';

/** One package this account has acquired, at the version it acquired. */
export interface Purchase {
  packageId: string;
  version: string;
  when: number;
}

export const RECEIPT_KINDS = ['subscription', 'package'] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

export function isReceiptKind(value: unknown): value is ReceiptKind {
  return RECEIPT_KINDS.some((kind) => kind === value);
}

/** A line in the account's history: what was charged, for what, when. */
export interface Receipt {
  /** Derived from the line's own fields, so the reducers stay pure. */
  id: string;
  kind: ReceiptKind;
  /** A plan id on a subscription line, a package id on a package line. */
  item: string;
  /** What the storefront prints beside the amount. */
  description: string;
  /** Minor units (pence). Package lines are zero: packages cost a plan, not money. */
  amountMinor: number;
  currency: CurrencyCode;
  when: number;
}

/** Everything the account holds, and the whole of what the file stores. */
export interface AccountState {
  /** Null when signed out. */
  account: Account | null;
  subscription: Subscription | null;
  purchases: readonly Purchase[];
  receipts: readonly Receipt[];
}

export const SIGNED_OUT: AccountState = {
  account: null,
  subscription: null,
  purchases: [],
  receipts: [],
};

export const PACKAGE_PRICES = ['free', 'subscription'] as const;
export type PackagePrice = (typeof PACKAGE_PRICES)[number];

export function isPackagePrice(value: unknown): value is PackagePrice {
  return PACKAGE_PRICES.some((price) => price === value);
}

/**
 * What this module needs to know about a catalogue package: its id, and
 * whether it costs a subscription (`store/FORMAT.md`). Said structurally
 * rather than imported, so a `PackageSummary` from the catalogue fits without
 * the account depending on the catalogue's parser.
 */
export interface PricedPackage {
  id: string;
  price: PackagePrice;
}

/** A package about to be installed: what it costs, and which version. */
export interface VersionedPackage extends PricedPackage {
  version: string;
}

/**
 * Why the storefront may or may not offer Install. The first three allow it:
 * the package is free, the account already bought it, or a plan covers it now.
 */
export const INSTALL_REASONS = [
  'free',
  'owned',
  'covered',
  'signed-out',
  'not-subscribed',
] as const;
export type InstallReason = (typeof INSTALL_REASONS)[number];

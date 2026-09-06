/**
 * The account on disk.
 *
 * One JSON file under the user's home holds the whole store account: there is
 * no server to ask, so the file is the account. Nothing here trusts it. A hand
 * edited or half-written document falls back field by field the way
 * `packages/apps/src/files/settings.ts` falls back to its defaults, and a
 * document that cannot be read at all signs the user out instead of throwing.
 */

import { join } from '@lumen/vfs';
import type { Account, AccountState, Purchase, Receipt, Subscription } from './types';
import {
  CURRENCY_CODES,
  isCurrencyCode,
  isPaidPlanId,
  isReceiptKind,
  isSubscriptionState,
  SIGNED_OUT,
} from './types';

/** The envelope's version, bumped only when the file's shape breaks. */
export const ACCOUNT_FORMAT = 1;

/** The name shown for an account whose own has gone missing. */
export const DEFAULT_DISPLAY_NAME = 'Guest';

/** How long a string field may be before it is cut. */
const MAX_TEXT = 200;

/** `~/.config/store-account.json`. */
export function accountPath(home: string): string {
  return join(home, '.config', 'store-account.json');
}

/** What is written: the state, under a version this build can recognise. */
export interface AccountFile {
  format: number;
  account: Account | null;
  subscription: Subscription | null;
  purchases: Purchase[];
  receipts: Receipt[];
}

export function toAccountFile(state: AccountState): AccountFile {
  return {
    format: ACCOUNT_FORMAT,
    account: state.account,
    subscription: state.subscription,
    purchases: [...state.purchases],
    receipts: [...state.receipts],
  };
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function present<T>(value: T | null): value is T {
  return value !== null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : fallback;
}

/** A time is a finite number of milliseconds, or nothing at all. */
function time(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Amounts are whole minor units and never negative; anything else reads as 0. */
function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function normaliseAccount(raw: unknown): Account | null {
  const value = record(raw);
  const id = text(value.id, '').trim();
  const created = time(value.created);
  // An account is its id and the day it was made. Without both there is no
  // account to fall back to, only a name floating on its own.
  if (id.length === 0 || created === null) return null;
  const displayName = text(value.displayName, '').trim();
  return { id, displayName: displayName.length > 0 ? displayName : DEFAULT_DISPLAY_NAME, created };
}

function normaliseSubscription(raw: unknown): Subscription | null {
  const value = record(raw);
  const planId = value.planId;
  const started = time(value.started);
  const renews = time(value.renews);
  // A plan nobody offers, or a period that ends before it began, is not a
  // subscription this build can reason about: the account drops to the free
  // tier rather than being granted or refused access on a guess.
  if (!isPaidPlanId(planId) || started === null || renews === null || renews < started) {
    return null;
  }
  // An unreadable state reads as cancelled: the period already paid for still
  // runs to its end, and nothing renews itself on the strength of a bad field.
  const state = isSubscriptionState(value.state) ? value.state : 'cancelled';
  return {
    planId,
    started,
    renews,
    state,
    cancelled: state === 'cancelled' ? time(value.cancelled) : null,
  };
}

function normalisePurchase(raw: unknown): Purchase | null {
  const value = record(raw);
  const packageId = text(value.packageId, '').trim();
  const when = time(value.when);
  if (packageId.length === 0 || when === null) return null;
  // Entitlement hangs on the package id; the version is only ever printed, so
  // a missing one loses a line of copy rather than something the user bought.
  return { packageId, version: text(value.version, ''), when };
}

function normaliseReceipt(raw: unknown): Receipt | null {
  const value = record(raw);
  const item = text(value.item, '').trim();
  const when = time(value.when);
  if (!isReceiptKind(value.kind) || item.length === 0 || when === null) return null;
  const kind = value.kind;
  return {
    id: text(value.id, '').trim() || `${kind}-${item}-${when}`,
    kind,
    item,
    description: text(value.description, ''),
    amountMinor: money(value.amountMinor),
    currency: isCurrencyCode(value.currency) ? value.currency : CURRENCY_CODES[0],
    when,
  };
}

/** One purchase per package, last row winning, as the reducers keep them. */
function dedupe(purchases: Purchase[]): Purchase[] {
  const byPackage = new Map<string, Purchase>();
  for (const purchase of purchases) byPackage.set(purchase.packageId, purchase);
  return [...byPackage.values()];
}

/**
 * Read a parsed document. Anything unreadable ends up signed out: an empty
 * account is a state the storefront can draw, and a half-read one is not.
 */
export function readAccountState(raw: unknown): AccountState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return SIGNED_OUT;
  const value = raw as Record<string, unknown>;
  const format = time(value.format);
  // Rule 1 of store/FORMAT.md, applied to our own file: a document from a
  // newer build may hold fields this one would misread, so it is refused whole.
  if (format === null || format > ACCOUNT_FORMAT) return SIGNED_OUT;
  const account = normaliseAccount(value.account);
  // A subscription and a shelf of purchases belong to an account. With no
  // readable one there is nobody to hold them.
  if (!account) return SIGNED_OUT;
  return {
    account,
    subscription: normaliseSubscription(value.subscription),
    purchases: dedupe(list(value.purchases).map(normalisePurchase).filter(present)),
    receipts: list(value.receipts).map(normaliseReceipt).filter(present),
  };
}

/** Read the file's text. Invalid JSON signs the user out rather than throwing. */
export function parseAccountFile(contents: string): AccountState {
  try {
    return readAccountState(JSON.parse(contents));
  } catch {
    return SIGNED_OUT;
  }
}

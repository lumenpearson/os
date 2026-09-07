/**
 * Subscription: what the plans cost, where this account stands, and the two
 * things that change it.
 *
 * Every figure here is arithmetic on `account/plans.ts`, where the year's
 * price is derived from the month's in integer pence. Nothing is asserted: the
 * saving printed on the yearly card is `savingMinor`, the line under its price
 * is `monthlyEquivalentMinor`, so moving the monthly price moves both without
 * anyone editing a card. No money moves either way — `subscribe` and `cancel`
 * write to one file under the user's home.
 */

import { Button } from '@lumen/ui';
import { Check } from 'lucide-react';
import type { AccountState, CurrencyCode, PaidPlanId, Plan } from './account';
import {
  currentPlan,
  isPaidPlanId,
  monthlyEquivalentMinor,
  PLANS,
  PLANS_BY_ID,
  savingMinor,
  subscriptionStatus,
} from './account';

/**
 * Prices are whole minor units — 500 is £5.00 — and stay integers until the
 * moment they are printed. `Intl` places the decimal point and the symbol,
 * because a hand-rolled `/ 100` with `toFixed` is right in one locale and
 * wrong in the rest. One formatter per currency, kept, since building one is
 * the expensive part.
 */
const MONEY = new Map<CurrencyCode, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: CurrencyCode): string {
  let format = MONEY.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    MONEY.set(currency, format);
  }
  return format.format(minor / 100);
}

/**
 * The day a moment falls on, read in UTC.
 *
 * `addMonths` counts a renewal in UTC, so a renewal read in the machine's own
 * zone would name the day before it for everyone west of Greenwich — and the
 * date this page prints is the one the account will actually charge on.
 */
const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDay(when: number): string {
  return DAY.format(new Date(when));
}

export interface StatusLines {
  title: string;
  detail: string;
}

/**
 * Where the subscription stands, in words. The four states are four different
 * sentences: cancelling in particular is not lapsed, and says when access ends
 * rather than talking as though it already had.
 */
export function statusLines(state: AccountState, now: number): StatusLines {
  const subscription = state.subscription;
  if (!state.account) {
    return {
      title: 'Not signed in',
      detail: 'A plan belongs to an account. Sign in under Account and these plans open up.',
    };
  }
  const status = subscriptionStatus(subscription, now);
  if (!subscription || status === 'none') {
    return {
      title: 'No subscription',
      detail:
        'Packages the catalogue prices at free install as they are. A plan opens the rest of it.',
    };
  }
  const plan = PLANS_BY_ID[subscription.planId];
  if (status === 'active') {
    return {
      title: `${plan.name} plan`,
      detail: `Renews on ${formatDay(subscription.renews)} for ${formatMoney(plan.priceMinor, plan.currency)}.`,
    };
  }
  if (status === 'cancelling') {
    const when =
      subscription.cancelled === null
        ? 'Cancelled'
        : `Cancelled on ${formatDay(subscription.cancelled)}`;
    return {
      title: `${plan.name} plan, cancelled`,
      detail: `${when}. The period already paid for runs to ${formatDay(subscription.renews)}, and access ends that day.`,
    };
  }
  return {
    title: `${plan.name} plan, ended`,
    detail: `Access ended on ${formatDay(subscription.renews)}. Everything installed is still installed; a plan is what opens the rest of the catalogue again.`,
  };
}

/**
 * The plan that saves the most against paying by the month, if any does. Read
 * off the prices rather than named, so the marked card follows the arithmetic.
 */
export function bestValue(plans: readonly Plan[]): Plan | null {
  let best: Plan | null = null;
  for (const plan of plans) {
    if (savingMinor(plan) <= 0) continue;
    if (best === null || savingMinor(plan) > savingMinor(best)) best = plan;
  }
  return best;
}

export interface PlanAction {
  label: string;
  /** What pressing it does; null when the button only states where things are. */
  act: 'subscribe' | 'resume' | 'cancel' | null;
}

/**
 * The one action at the foot of a plan's card.
 *
 * The free tier cannot be subscribed to — it is what an account has when it
 * pays nothing — so its button is the way back to it: cancel, and then the
 * date that takes effect. Resume is `subscribe` on the plan already running,
 * which clears the cancellation without charging a second time.
 */
export function planAction(plan: Plan, state: AccountState, now: number): PlanAction {
  const subscription = state.subscription;
  const status = subscriptionStatus(subscription, now);
  if (plan.id === 'free') {
    if (status === 'active') return { label: 'Cancel subscription', act: 'cancel' };
    if (subscription && status === 'cancelling') {
      return { label: `From ${formatDay(subscription.renews)}`, act: null };
    }
    return { label: 'Current plan', act: null };
  }
  if (!state.account) return { label: 'Sign in to subscribe', act: null };
  if (subscription && subscription.planId === plan.id) {
    if (status === 'active') return { label: 'Current plan', act: null };
    if (status === 'cancelling') return { label: 'Resume', act: 'resume' };
  }
  if (status === 'active' || status === 'cancelling') {
    return { label: `Switch to ${plan.name}`, act: 'subscribe' };
  }
  return { label: 'Subscribe', act: 'subscribe' };
}

function PlanCard({
  plan,
  state,
  now,
  best,
  onSubscribe,
  onCancel,
}: {
  plan: Plan;
  state: AccountState;
  now: number;
  best: boolean;
  onSubscribe: (planId: PaidPlanId) => void;
  onCancel: () => void;
}) {
  const action = planAction(plan, state, now);
  const monthly = monthlyEquivalentMinor(plan);
  const run = () => {
    if (action.act === 'cancel') onCancel();
    else if (isPaidPlanId(plan.id)) onSubscribe(plan.id);
  };
  return (
    <section
      aria-label={plan.name}
      aria-current={currentPlan(state, now).id === plan.id ? 'true' : undefined}
      // The card's own corner is --radius-2xl and its depth is the hairline
      // and drop of --shadow-card, which is why there is no border here: a
      // border as well would paint the ring twice. The controls inside sit at
      // --radius-md, which is this corner less the padding.
      // deslop-ignore-next-line 21
      className="flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-card"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-md font-medium text-ink">{plan.name}</h3>
        {best && (
          <span className="mono rounded-xs bg-accent px-1.5 py-0.5 text-2xs text-accent-ink tabular-nums">
            Saves {formatMoney(savingMinor(plan), plan.currency)} a {plan.period}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-0.5">
        <p className="flex items-baseline gap-1.5">
          <span className="mono text-xl text-ink tabular-nums">
            {formatMoney(plan.priceMinor, plan.currency)}
          </span>
          {plan.period && <span className="text-sm text-ink-2">a {plan.period}</span>}
        </p>
        {monthly !== plan.priceMinor && (
          <p className="mono text-sm text-ink-2 tabular-nums">
            {formatMoney(monthly, plan.currency)} a month
          </p>
        )}
      </div>

      <p className="text-sm text-ink-2">{plan.summary}</p>

      <ul className="flex flex-col gap-1.5">
        {plan.includes.map((line) => (
          <li key={line} className="flex items-start gap-1.5 text-sm text-ink-2">
            <Check aria-hidden className="mt-0.5 size-3 shrink-0 text-ink-3" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-1">
        <Button
          block
          size="lg"
          variant={best && action.act !== null ? 'primary' : 'secondary'}
          disabled={action.act === null}
          onClick={run}
        >
          {action.label}
        </Button>
      </div>
    </section>
  );
}

export interface SubscriptionSectionProps {
  state: AccountState;
  /** The moment the page is drawn: which plan is in force is a fact about it. */
  now: number;
  onSubscribe: (planId: PaidPlanId) => void;
  onCancel: () => void;
}

export function SubscriptionSection({
  state,
  now,
  onSubscribe,
  onCancel,
}: SubscriptionSectionProps) {
  const lines = statusLines(state, now);
  const best = bestValue(PLANS);
  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="mx-auto flex max-w-3xl flex-col gap-7 px-4 py-5">
        <section className="flex flex-col gap-1">
          <h2 className="text-md font-medium text-ink">{lines.title}</h2>
          <p className="max-w-2xl text-base text-ink-2">{lines.detail}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-md font-medium text-ink">Plans</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(196px,1fr))]">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                state={state}
                now={now}
                best={best?.id === plan.id}
                onSubscribe={onSubscribe}
                onCancel={onCancel}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

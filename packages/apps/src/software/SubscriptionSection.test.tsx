import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AccountState, Identity, PaidPlanId } from './account';
import {
  cancel,
  FREE_PLAN,
  MONTHLY_PLAN,
  MONTHLY_PRICE_MINOR,
  monthlyEquivalentMinor,
  PLANS,
  SIGNED_OUT,
  savingMinor,
  signIn,
  subscribe,
  YEARLY_DISCOUNT_MINOR,
  YEARLY_PLAN,
  YEARLY_PRICE_MINOR,
} from './account';
import {
  bestValue,
  formatDay,
  formatMoney,
  planAction,
  SubscriptionSection,
  statusLines,
} from './SubscriptionSection';

/** Fixed moments, so nothing here depends on when the tests run. */
const CREATED = Date.parse('2026-09-01T08:00:00Z');
const SUBSCRIBED = Date.parse('2026-09-05T09:00:00Z');
const MID_PERIOD = Date.parse('2026-09-20T12:00:00Z');
const RENEWS = Date.parse('2026-10-05T09:00:00Z');
const AFTER_RENEWAL = Date.parse('2026-10-06T12:00:00Z');

const ADA: Identity = { id: 'ada', displayName: 'Ada' };

const signedIn = () => signIn(SIGNED_OUT, ADA, CREATED);
const subscribed = (planId: PaidPlanId = 'monthly') => subscribe(signedIn(), planId, SUBSCRIBED);
const cancelling = () => cancel(subscribed(), MID_PERIOD);

function mount(state: AccountState, now: number) {
  const onSubscribe = vi.fn();
  const onCancel = vi.fn();
  render(
    <SubscriptionSection state={state} now={now} onSubscribe={onSubscribe} onCancel={onCancel} />,
  );
  return { onSubscribe, onCancel };
}

const card = (name: string) => within(screen.getByRole('region', { name }));

describe('formatMoney', () => {
  it('reads minor units as money, with the point where the locale puts it', () => {
    expect(formatMoney(MONTHLY_PRICE_MINOR, 'GBP')).toMatch(/5[.,]00/);
    expect(formatMoney(YEARLY_PRICE_MINOR, 'GBP')).toMatch(/48[.,]00/);
    expect(formatMoney(0, 'GBP')).toMatch(/0[.,]00/);
  });

  it('never prints the minor units themselves', () => {
    expect(formatMoney(MONTHLY_PRICE_MINOR, 'GBP')).not.toMatch(/500/);
  });

  it('names the currency it was charged in', () => {
    expect(formatMoney(MONTHLY_PRICE_MINOR, 'GBP')).toMatch(/£|GBP/);
  });
});

describe('formatDay', () => {
  it('reads the day in UTC, so a renewal keeps the date it renews on', () => {
    expect(formatDay(Date.UTC(2026, 9, 6, 23, 30))).toBe(formatDay(Date.UTC(2026, 9, 6, 0, 30)));
    expect(formatDay(Date.UTC(2026, 9, 6, 23, 30))).not.toBe(formatDay(Date.UTC(2026, 9, 7, 12)));
  });

  it('carries the year', () => {
    expect(formatDay(Date.UTC(2026, 9, 6))).toContain('2026');
  });
});

describe('statusLines', () => {
  it('asks for an account before a plan', () => {
    expect(statusLines(SIGNED_OUT, MID_PERIOD).title).toBe('Not signed in');
  });

  it('says what the free tier still installs', () => {
    const lines = statusLines(signedIn(), MID_PERIOD);
    expect(lines.title).toBe('No subscription');
    expect(lines.detail).toContain('free');
  });

  it('names the next charge and its date', () => {
    const lines = statusLines(subscribed(), MID_PERIOD);
    expect(lines.title).toBe('Monthly plan');
    expect(lines.detail).toBe(
      `Renews on ${formatDay(RENEWS)} for ${formatMoney(MONTHLY_PRICE_MINOR, 'GBP')}.`,
    );
  });

  it('says when a cancelled plan ends rather than that it has', () => {
    const lines = statusLines(cancelling(), MID_PERIOD);
    expect(lines.title).toBe('Monthly plan, cancelled');
    expect(lines.detail).toContain(`Cancelled on ${formatDay(MID_PERIOD)}`);
    expect(lines.detail).toContain(`runs to ${formatDay(RENEWS)}`);
    expect(lines.detail).toContain('access ends that day');
  });

  it('speaks of a lapsed plan in the past, and of what stays installed', () => {
    const lines = statusLines(cancelling(), AFTER_RENEWAL);
    expect(lines.title).toBe('Monthly plan, ended');
    expect(lines.detail).toContain(`Access ended on ${formatDay(RENEWS)}`);
    expect(lines.detail).toContain('still installed');
  });
});

describe('bestValue', () => {
  it('is the plan that saves the most against paying by the month', () => {
    expect(bestValue(PLANS)).toBe(YEARLY_PLAN);
    expect(savingMinor(YEARLY_PLAN)).toBe(YEARLY_DISCOUNT_MINOR);
  });

  it('marks nothing when no plan saves anything', () => {
    expect(bestValue([FREE_PLAN, MONTHLY_PLAN])).toBeNull();
  });
});

describe('planAction', () => {
  it('offers the free tier as the way out of a running plan', () => {
    expect(planAction(FREE_PLAN, subscribed(), MID_PERIOD)).toEqual({
      label: 'Cancel subscription',
      act: 'cancel',
    });
  });

  it('dates the free tier once a plan is cancelled, rather than offering it twice', () => {
    expect(planAction(FREE_PLAN, cancelling(), MID_PERIOD)).toEqual({
      label: `From ${formatDay(RENEWS)}`,
      act: null,
    });
  });

  it('is the current plan when nothing is subscribed', () => {
    expect(planAction(FREE_PLAN, signedIn(), MID_PERIOD).act).toBeNull();
  });

  it('asks a signed-out visitor for an account first', () => {
    expect(planAction(YEARLY_PLAN, SIGNED_OUT, MID_PERIOD)).toEqual({
      label: 'Sign in to subscribe',
      act: null,
    });
  });

  it('subscribes when there is nothing to switch from', () => {
    expect(planAction(MONTHLY_PLAN, signedIn(), MID_PERIOD)).toEqual({
      label: 'Subscribe',
      act: 'subscribe',
    });
  });

  it('says nothing to press on the plan already running', () => {
    expect(planAction(MONTHLY_PLAN, subscribed(), MID_PERIOD)).toEqual({
      label: 'Current plan',
      act: null,
    });
  });

  it('resumes the plan that was cancelled inside its paid period', () => {
    expect(planAction(MONTHLY_PLAN, cancelling(), MID_PERIOD)).toEqual({
      label: 'Resume',
      act: 'resume',
    });
  });

  it('calls the other plan a switch while one is running', () => {
    expect(planAction(YEARLY_PLAN, subscribed(), MID_PERIOD)).toEqual({
      label: 'Switch to Yearly',
      act: 'subscribe',
    });
  });

  it('subscribes again once the plan has lapsed', () => {
    expect(planAction(MONTHLY_PLAN, cancelling(), AFTER_RENEWAL)).toEqual({
      label: 'Subscribe',
      act: 'subscribe',
    });
  });
});

describe('the plan cards', () => {
  it('draws one card per plan', () => {
    mount(signedIn(), MID_PERIOD);
    for (const plan of PLANS) expect(screen.getByRole('region', { name: plan.name })).toBeVisible();
  });

  it('prints each price from the plan, and the year per month beside it', () => {
    mount(signedIn(), MID_PERIOD);
    expect(card('Monthly').getByText(formatMoney(MONTHLY_PRICE_MINOR, 'GBP'))).toBeVisible();
    expect(card('Yearly').getByText(formatMoney(YEARLY_PRICE_MINOR, 'GBP'))).toBeVisible();
    expect(
      card('Yearly').getByText(
        `${formatMoney(monthlyEquivalentMinor(YEARLY_PLAN), 'GBP')} a month`,
      ),
    ).toBeVisible();
    // A month costs a month, so the monthly card prints its price once and
    // does not repeat it as a monthly equivalent of itself.
    expect(card('Monthly').getAllByText(formatMoney(MONTHLY_PRICE_MINOR, 'GBP'))).toHaveLength(1);
  });

  it('marks the yearly plan with what it actually saves', () => {
    mount(signedIn(), MID_PERIOD);
    expect(
      card('Yearly').getByText(`Saves ${formatMoney(YEARLY_DISCOUNT_MINOR, 'GBP')} a year`),
    ).toBeVisible();
    expect(card('Monthly').queryByText(/Saves/)).not.toBeInTheDocument();
  });

  it('subscribes to the plan whose button was pressed', async () => {
    const { onSubscribe } = mount(signedIn(), MID_PERIOD);
    await userEvent.click(card('Yearly').getByRole('button', { name: 'Subscribe' }));
    expect(onSubscribe).toHaveBeenCalledWith('yearly');
  });

  it('cancels from the free tier, and only once', async () => {
    const { onCancel, onSubscribe } = mount(subscribed(), MID_PERIOD);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubscribe).not.toHaveBeenCalled();
  });

  it('resumes the cancelled plan without asking for a different one', async () => {
    const { onSubscribe } = mount(cancelling(), MID_PERIOD);
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onSubscribe).toHaveBeenCalledWith('monthly');
  });

  it('leaves nothing to press until there is an account', () => {
    mount(SIGNED_OUT, MID_PERIOD);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('heads the page with where the subscription stands', () => {
    mount(cancelling(), MID_PERIOD);
    expect(screen.getByRole('heading', { name: 'Monthly plan, cancelled' })).toBeVisible();
  });
});

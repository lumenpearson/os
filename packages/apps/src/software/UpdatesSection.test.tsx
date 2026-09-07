import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PackageSummary, StoreError } from './remote';
import { checkedAt, UpdatesSection } from './UpdatesSection';
import type { AvailableUpdate } from './updates';

const summary = (id: string): PackageSummary =>
  ({ id, kind: 'app', name: id, version: '2.0.0', price: 'free' }) as PackageSummary;

const update = (id: string, from: string, to: string): AvailableUpdate => ({
  id,
  name: id,
  from,
  to,
  summary: summary(id),
});

const CHECKED = Date.UTC(2026, 8, 7, 12, 0);

function mount(props: Partial<Parameters<typeof UpdatesSection>[0]> = {}) {
  const onCheck = vi.fn();
  const onUpdate = vi.fn();
  const onUpdateAll = vi.fn();
  render(
    <UpdatesSection
      updates={[]}
      checking={false}
      lastChecked={CHECKED}
      error={null}
      locale="en-GB"
      automatic={false}
      busyIds={new Set()}
      onCheck={onCheck}
      onUpdate={onUpdate}
      onUpdateAll={onUpdateAll}
      {...props}
    />,
  );
  return { onCheck, onUpdate, onUpdateAll };
}

describe('checkedAt', () => {
  it('says there has been no check rather than printing an epoch', () => {
    expect(checkedAt(null, 'en-GB')).toBe('Not checked yet');
  });

  it('carries the moment of the last one', () => {
    expect(checkedAt(CHECKED, 'en-GB')).toContain('2026');
  });
});

describe('UpdatesSection', () => {
  it('says everything is current when a check has found nothing', () => {
    mount();
    expect(screen.getByText('Everything is up to date')).toBeVisible();
  });

  it('does not claim to be up to date before anything was checked', () => {
    mount({ lastChecked: null });
    // Twice: once in the header line, once as the empty state's own heading.
    expect(screen.getAllByText('Not checked yet').length).toBeGreaterThan(0);
    expect(screen.queryByText('Everything is up to date')).not.toBeInTheDocument();
  });

  it('lists each update as the two versions that disagree', () => {
    mount({ updates: [update('com.lumen.diff', '1.0.0', '1.0.2')] });
    expect(screen.getByText(/1\.0\.0/)).toBeVisible();
    expect(screen.getByText(/1\.0\.2/)).toBeVisible();
  });

  it('updates the package whose button was pressed', async () => {
    const { onUpdate } = mount({ updates: [update('com.lumen.diff', '1.0.0', '1.0.2')] });
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'com.lumen.diff' }));
  });

  it('offers Update All only when there is more than one', () => {
    mount({ updates: [update('a', '1.0.0', '1.1.0')] });
    expect(screen.queryByRole('button', { name: 'Update All' })).not.toBeInTheDocument();
  });

  it('offers Update All for several, and presses it once', async () => {
    const { onUpdateAll } = mount({
      updates: [update('a', '1.0.0', '1.1.0'), update('b', '2.0.0', '2.1.0')],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Update All' }));
    expect(onUpdateAll).toHaveBeenCalledTimes(1);
  });

  it('leaves a row that is already installing alone', () => {
    mount({ updates: [update('a', '1.0.0', '1.1.0')], busyIds: new Set(['a']) });
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
  });

  it('will not ask for a second check while one is running', () => {
    mount({ checking: true });
    expect(screen.getByRole('button', { name: /Checking/ })).toBeDisabled();
  });

  it('says why a check failed, in the store’s own words', () => {
    const error: StoreError = {
      reason: 'timeout',
      url: 'https://store.example/index.json',
      ms: 15_000,
      message: 'The store did not answer within 15 seconds.',
    };
    mount({ error });
    expect(screen.getByText('The store did not answer')).toBeVisible();
    expect(screen.getByText(error.message)).toBeVisible();
  });

  it('says so when a found update will install itself', () => {
    mount({ automatic: true });
    expect(screen.getByText(/installs itself/)).toBeVisible();
  });
});

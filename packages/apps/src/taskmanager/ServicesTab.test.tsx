import { SERVICES, useServiceStore } from '@lumen/kernel';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { categoryOptions, ServicesTab, sortValue } from './ServicesTab';

beforeEach(() => useServiceStore.getState().boot(1_000));
afterEach(cleanup);

describe('sortValue', () => {
  const row = {
    service: SERVICES[0] as (typeof SERVICES)[number],
    state: 'running' as const,
    startedAt: 1,
    essential: true,
  };

  it('ranks the running services above the rest', () => {
    const running = sortValue({ ...row, state: 'running' }, 'state') as number;
    const demand = sortValue({ ...row, state: 'on-demand' }, 'state') as number;
    const stopped = sortValue({ ...row, state: 'stopped' }, 'state') as number;
    expect(running).toBeLessThan(demand);
    expect(demand).toBeLessThan(stopped);
  });

  it('puts what is implemented here before what is only declared', () => {
    const real = { ...row, service: { ...row.service, implemented: true } };
    const declared = { ...row, service: { ...row.service, implemented: false } };
    expect(sortValue(real, 'kind')).toBeLessThan(sortValue(declared, 'kind') as number);
  });
});

describe('categoryOptions', () => {
  it('offers every category that has a service, and all of them together', () => {
    const options = categoryOptions();
    expect(options[0]).toEqual({ value: 'all', label: 'All categories' });
    const values = options.slice(1).map((o) => o.value);
    expect(values).toContain('core');
    expect(values).toContain('printing');
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('ServicesTab', () => {
  it('lists the services and says which are real code', () => {
    render(<ServicesTab />);
    expect(screen.getByText('Window Server')).toBeInTheDocument();
    expect(screen.getAllByText('system').length).toBeGreaterThan(0);
    expect(screen.getAllByText('declared').length).toBeGreaterThan(0);
  });

  it('will not offer to stop a service the system is standing on', () => {
    render(<ServicesTab />);
    const row = screen.getByText('Window Server').closest('[role="row"]');
    expect(row).not.toBeNull();
    const stop = within(row as HTMLElement).getByRole('button', { name: 'Stop' });
    expect(stop).toBeDisabled();
  });

  it('stops and starts a service that may be stopped', async () => {
    render(<ServicesTab />);
    const row = screen.getByText('Shortcuts').closest('[role="row"]') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Stop' }));
    expect(useServiceStore.getState().statuses['com.lumen.shortcutd']?.state).toBe('stopped');
    const again = screen.getByText('Shortcuts').closest('[role="row"]') as HTMLElement;
    await userEvent.click(within(again).getByRole('button', { name: 'Start' }));
    expect(useServiceStore.getState().statuses['com.lumen.shortcutd']?.state).toBe('running');
  });
});

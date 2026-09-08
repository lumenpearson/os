import { createKernel, type Kernel, useUsersStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../../_sdk';
import { ProfilesGroup } from './Profiles';

let kernel: Kernel;

const accounts = () => useUsersStore.getState().users;

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: 1, windowId: 'w1', appId: 'lumen.settings', container: null }}>
        <DialogProvider>
          <ProfilesGroup />
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

async function addProfile(name: string, password = 'nanosecond') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add a profile…' }));
  await user.type(await screen.findByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Confirm password'), password);
  await user.click(screen.getByRole('button', { name: 'Create profile' }));
}

describe('the people on this machine', () => {
  it('lists the account signed in, and says so rather than offering to switch to it', () => {
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch to' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('names the home directory the account owns', () => {
    expect(screen.getByText('/Users/adalovelace')).toBeInTheDocument();
  });

  it('adds a profile and shows its recovery key once', async () => {
    await addProfile('Grace Hopper');
    await waitFor(() => expect(accounts()).toHaveLength(2));
    expect(await screen.findByText(/recovery key/i)).toBeInTheDocument();
    expect(screen.getByText('Shown once. Write it down before closing this dialog.')).toBeVisible();
  });

  it('does not sign the new account in', async () => {
    const before = useUsersStore.getState().currentUserId;
    await addProfile('Grace Hopper');
    await waitFor(() => expect(accounts()).toHaveLength(2));
    expect(useUsersStore.getState().currentUserId).toBe(before);
  });

  it('will not create a profile until the passwords agree', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a profile…' }));
    await user.type(await screen.findByLabelText('Name'), 'Grace Hopper');
    await user.type(screen.getByLabelText('Password'), 'nanosecond');
    await user.type(screen.getByLabelText('Confirm password'), 'microsecond');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeDisabled();
  });

  it('offers Switch to and Remove for the other account only', async () => {
    await addProfile('Grace Hopper');
    await waitFor(() => expect(accounts()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getAllByRole('button', { name: 'Switch to' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('asks before removing, and says the files stay', async () => {
    await addProfile('Grace Hopper');
    await waitFor(() => expect(accounts()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Remove Grace Hopper?')).toBeInTheDocument();
    expect(
      screen.getByText('Their files stay where they are. Only the way in goes.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(accounts()).toHaveLength(2);
  });

  it('removes the account when the question is answered yes', async () => {
    await addProfile('Grace Hopper');
    await waitFor(() => expect(accounts()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove Grace Hopper?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(accounts()).toHaveLength(1));
    expect(accounts()[0]?.name).toBe('Ada Lovelace');
  });
});

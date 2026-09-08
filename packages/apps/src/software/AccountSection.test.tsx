import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountSection, identityFor } from './AccountSection';
import { type AccountState, SIGNED_OUT, signIn } from './account';

const NOW = 86_400_000 * 20_000;

function mount(state: AccountState, onSignIn = vi.fn(), onSignOut = vi.fn()) {
  render(<AccountSection state={state} now={NOW} onSignIn={onSignIn} onSignOut={onSignOut} />);
  return { onSignIn, onSignOut };
}

describe('identityFor', () => {
  it('takes nothing from a name that is only space', () => {
    expect(identityFor('')).toBeNull();
    expect(identityFor('   ')).toBeNull();
  });

  it('keeps what was typed as the name and folds it for the id', () => {
    expect(identityFor('Ada Lovelace')).toEqual({
      id: 'ada-lovelace',
      displayName: 'Ada Lovelace',
    });
  });

  it('signs the same person back into the same account', () => {
    /*
     * The whole point of deriving the id from the name: there is no server to
     * look an account up in, so a fresh random id would mean every sign-in
     * started an empty account and a subscription could never be returned to.
     * Case and spacing are what people get wrong retyping a name.
     */
    expect(identityFor('  ADA   lovelace ')?.id).toBe(identityFor('Ada Lovelace')?.id);
    expect(identityFor('Ada Lovelace')?.id).not.toBe(identityFor('Alan Turing')?.id);
  });

  it('keeps the name as typed even where the id folds it', () => {
    expect(identityFor('  ADA   lovelace ')?.displayName).toBe('ADA lovelace');
  });
});

describe('AccountSection', () => {
  it('offers the sign-in when nobody is signed in', () => {
    mount(SIGNED_OUT);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('refuses to sign in on an empty name', () => {
    mount(SIGNED_OUT);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('hands back the identity the typed name stands for', async () => {
    const { onSignIn } = mount(SIGNED_OUT);
    await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledWith({ id: 'ada-lovelace', displayName: 'Ada Lovelace' });
  });

  it('shows who is signed in, and on what plan', () => {
    mount(signIn(SIGNED_OUT, { id: 'ada-lovelace', displayName: 'Ada Lovelace' }, NOW));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // Signed in and nothing taken out: the free plan is the one in force.
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('signs out', async () => {
    const { onSignOut } = mount(
      signIn(SIGNED_OUT, { id: 'ada-lovelace', displayName: 'Ada Lovelace' }, NOW),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});

/**
 * Account: who is signed in, and the plan they are on.
 *
 * There is nothing to authenticate against. The account is one file under the
 * user's home, so signing in is naming yourself and signing out is emptying
 * the file — which is why the last row says so before offering the button.
 */

import { Avatar, Button, Field, Input, SettingsGroup, SettingsRow } from '@lumen/ui';
import { type FormEvent, useState } from 'react';
import type { AccountState, Identity } from './account';
import { currentPlan } from './account';
// The account's dates read the way a renewal date does; see the note there on
// why the day is taken in UTC.
import { formatDay } from './SubscriptionSection';

/**
 * The identity a typed name stands for, or null when nothing was typed.
 *
 * `signIn` treats the id as the account: the same id keeps its subscription
 * and its purchases, any other id starts empty. So the id is derived from the
 * name rather than made up fresh — with no server to look an account up in, a
 * random id would mean every sign-in was a new account and nothing could ever
 * be signed back into. Case and spacing are what people get wrong retyping a
 * name, so the id ignores both while the display name keeps what was typed.
 */
export function identityFor(name: string): Identity | null {
  const displayName = name.trim().replace(/\s+/g, ' ');
  if (displayName.length === 0) return null;
  return { id: displayName.toLowerCase().replace(/\s/g, '-'), displayName };
}

function SignInForm({ onSignIn }: { onSignIn: (identity: Identity) => void }) {
  const [name, setName] = useState('');
  const identity = identityFor(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (identity) onSignIn(identity);
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <header className="flex flex-col gap-1">
        <h2 className="text-md font-medium text-ink">Sign in</h2>
        <p className="text-base text-ink-2">
          The account is one file under your home. Nothing is sent anywhere and nothing is checked.
        </p>
      </header>
      <Field
        label="Name"
        hint="The same name signs back into the same account, with the plan and the packages it holds."
      >
        <Input
          value={name}
          autoComplete="off"
          spellCheck={false}
          placeholder="Ada Lovelace"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" className="self-start" disabled={identity === null}>
        Sign in
      </Button>
    </form>
  );
}

export interface AccountSectionProps {
  state: AccountState;
  /** The moment the page is drawn: which plan is in force is a fact about it. */
  now: number;
  onSignIn: (identity: Identity) => void;
  onSignOut: () => void;
}

export function AccountSection({ state, now, onSignIn, onSignOut }: AccountSectionProps) {
  const account = state.account;
  const plan = currentPlan(state, now);
  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 py-5">
        {account === null ? (
          <SignInForm onSignIn={onSignIn} />
        ) : (
          <>
            <header className="flex items-center gap-3">
              <Avatar name={account.displayName} size={40} />
              <div className="min-w-0">
                <p className="truncate-1 text-lg font-semibold text-ink">{account.displayName}</p>
                <p className="mono truncate-1 text-sm text-ink-3">{account.id}</p>
              </div>
            </header>

            <SettingsGroup title="Plan">
              <SettingsRow label="On" description={plan.summary}>
                <span className="mono text-base text-ink">{plan.name}</span>
              </SettingsRow>
              <SettingsRow
                label="Subscription packages"
                description="Packages the catalogue prices at subscription rather than free."
              >
                <span className="mono text-base text-ink">
                  {plan.unlocksSubscriptions ? 'Included' : 'Not included'}
                </span>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="Account">
              <SettingsRow label="Created">
                <span className="mono text-base text-ink tabular-nums">
                  {formatDay(account.created)}
                </span>
              </SettingsRow>
              <SettingsRow
                label="Packages bought"
                description="Kept at the version they were bought at, whether or not a plan is running."
              >
                <span className="mono text-base text-ink tabular-nums">
                  {state.purchases.length}
                </span>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow
                label="Sign out"
                description="The file is the account; no copy is held anywhere else. Signing out clears the plan and the packages with it."
              >
                <Button onClick={onSignOut}>Sign out</Button>
              </SettingsRow>
            </SettingsGroup>
          </>
        )}
      </div>
    </div>
  );
}

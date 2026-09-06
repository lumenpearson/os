/**
 * More than one person on this machine.
 *
 * Adding a profile creates an account and seeds a home directory for it, and
 * nothing else: it does not sign you out, and it does not sign them in. The
 * recovery key is shown once here for the same reason it is shown once at
 * first run — it is not stored anywhere it could be read back.
 *
 * Removing an account leaves its files where they are. Deleting somebody's
 * documents is a separate decision from taking away their way in, and it is
 * not one this button is entitled to make on their behalf; the row says so.
 */

import { AVATAR_PRESETS, passwordStrength, useUsersStore } from '@lumen/kernel';

type AvatarId = (typeof AVATAR_PRESETS)[number]['id'];

import { useClipboard, useCurrentUser, useKernel } from '@lumen/kernel/react';
import { Avatar, Button, cx, Dialog, Field, Input, SettingsGroup, useDialogs } from '@lumen/ui';
import { Check, Copy, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../_sdk';
import { ChoiceGroup, Row, Value } from '../Row';

export function ProfilesGroup() {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const current = useCurrentUser();
  const accounts = useUsersStore((s) => s.users);
  const [adding, setAdding] = useState(false);

  const remove = async (id: string, name: string) => {
    const ok = await dialogs.confirm({
      title: `Remove ${name}?`,
      message: 'Their files stay where they are. Only the way in goes.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    const result = await kernel.removeProfile(id);
    if (result.ok) return;
    await dialogs.alert({
      title: `${name} was not removed`,
      message:
        result.reason === 'current'
          ? 'This is the account you are signed in to. Switch to another one first.'
          : 'This is the only account on the machine.',
    });
  };

  return (
    <SettingsGroup title="People">
      {accounts.map((account) => {
        const isCurrent = account.id === current?.id;
        return (
          <Row
            key={account.id}
            id={`security.profile.${account.id}`}
            label={account.name}
            description={`/Users/${account.username}`}
          >
            <Avatar name={account.name} src={account.avatar} size={28} />
            {isCurrent ? (
              <Value>Signed in</Value>
            ) : (
              <>
                <Button size="sm" onClick={() => void kernel.switchUser(account.id)}>
                  Switch to
                </Button>
                <Button size="sm" onClick={() => void remove(account.id, account.name)}>
                  Remove
                </Button>
              </>
            )}
          </Row>
        );
      })}
      <Row
        id="security.addProfile"
        label="Add a profile"
        description="A separate account with its own home directory and password."
      >
        <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)}>
          Add a profile…
        </Button>
      </Row>
      {adding && <AddProfileDialog open onClose={() => setAdding(false)} />}
    </SettingsGroup>
  );
}

function AddProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kernel = useKernel();
  const { container } = useApp();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(AVATAR_PRESETS[0]?.id ?? 'preset:ember');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ name: string; recoveryKey: string } | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = name.trim().length > 0 && password.length > 0 && confirm === password;

  const close = () => {
    if (busy) return;
    onClose();
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await kernel.createProfile({
        name: name.trim(),
        password,
        hint: hint.trim(),
        avatar,
      });
      setMade({ name: result.user.name, recoveryKey: result.recoveryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={made ? `${made.name}'s recovery key` : 'Add a profile'}
      container={container}
      persistent={busy}
      actions={
        made ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              Create profile
            </Button>
          </>
        )
      }
    >
      {made ? (
        <RecoveryKey value={made.recoveryKey} />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Name">
            <Input
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Grace Hopper"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Strength password={password} />
          </Field>
          <Field label="Confirm password" error={mismatch ? 'Passwords do not match.' : null}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              invalid={mismatch}
            />
          </Field>
          <Field label="Hint" hint="Shown on the lock screen after a wrong attempt.">
            <Input value={hint} onChange={(e) => setHint(e.target.value)} />
          </Field>
          <ChoiceGroup
            label="Picture"
            labelHidden
            value={avatar}
            onChange={setAvatar}
            options={AVATAR_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
              render: (selected) => (
                <Avatar
                  name={name || preset.label}
                  src={preset.id}
                  size={32}
                  className={cx(selected && 'ring-2 ring-accent')}
                />
              ),
            }))}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="sr-only" tabIndex={-1}>
            Submit
          </button>
        </form>
      )}
    </Dialog>
  );
}

function Strength({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            // deslop-ignore-next-line 19 a 4px meter segment, the shape the Progress atom uses
            className={cx('h-1 flex-1 rounded-full', i < s.score ? 'bg-accent' : 'bg-surface-3')}
          />
        ))}
      </div>
      <span className="w-20 shrink-0 text-right text-sm text-ink-2">{s.label}</span>
    </div>
  );
}

function RecoveryKey({ value }: { value: string }) {
  const { copyText } = useClipboard();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = () => {
    copyText(value);
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        This unlocks the new account if its password is forgotten. Give it to whoever the account is
        for.
      </p>
      <div className="mono select-text rounded-md border border-rule bg-canvas px-3 py-3 text-center text-md tracking-wider text-ink">
        {value}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-danger">Shown once. Write it down before closing this dialog.</p>
        <Button
          size="sm"
          icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

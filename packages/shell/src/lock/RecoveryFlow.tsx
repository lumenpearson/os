import { isRecoveryKeyShape, normalizeRecoveryKey, passwordStrength } from '@lumen/kernel';
import { useCurrentUser, useKernel } from '@lumen/kernel/react';
import { Button, Checkbox, Field, Input } from '@lumen/ui';
import { type FormEvent, useState } from 'react';

type Step = 'key' | 'password' | 'newkey' | 'erase';

/**
 * Forgot-password flow on the lock screen: verify the recovery key, set a
 * new password, receive a fresh key. Or erase the device.
 */
export function RecoveryFlow({ onCancel }: { onCancel: () => void }) {
  const kernel = useKernel();
  const user = useCurrentUser();
  const [step, setStep] = useState<Step>('key');
  const [key, setKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState(user?.hint ?? '');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [eraseText, setEraseText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!isRecoveryKeyShape(key)) {
      setError('That does not look like a recovery key.');
      return;
    }
    setBusy(true);
    const ok = await kernel.verifyRecovery(key);
    setBusy(false);
    if (!ok) {
      setError('Recovery key not recognised.');
      return;
    }
    setError(null);
    setStep('password');
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length > 0 && password.length < 4) {
      setError('Use at least 4 characters, or leave it empty.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords differ.');
      return;
    }
    setBusy(true);
    const fresh = await kernel.resetPassword(password, hint.trim());
    setBusy(false);
    setNewKey(fresh);
    setStep('newkey');
  };

  const finish = async () => {
    setBusy(true);
    await kernel.unlock(password);
    setBusy(false);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div
        className="w-full max-w-[420px] rounded-lg border border-rule bg-surface p-6 text-ink shadow-lg"
        data-testid="recovery-flow"
      >
        {step === 'key' && (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold">Recover access</h1>
            <p className="text-base text-ink-2">
              Enter the recovery key you saved when you set up{' '}
              {user?.name ? `${user.name}'s` : 'this'} account.
            </p>
            <Field label="Recovery key" error={error} htmlFor="recovery-key">
              <Input
                id="recovery-key"
                mono
                autoFocus
                value={key}
                onChange={(e) => {
                  setKey(normalizeRecoveryKey(e.target.value));
                  setError(null);
                }}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                className="tracking-[0.06em]"
              />
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <Button variant="ghost" onClick={onCancel}>
                Back
              </Button>
              <button
                type="button"
                onClick={() => setStep('erase')}
                className="text-sm text-ink-3 underline-offset-2 hover:underline lumen-focus rounded-xs"
              >
                I lost the key
              </button>
              <div className="flex-1" />
              <Button type="submit" variant="primary" loading={busy}>
                Continue
              </Button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={reset} className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold">New password</h1>
            <Field
              label="Password"
              hint={password ? passwordStrength(password).label : 'Leave empty for no password.'}
              htmlFor="recovery-password"
            >
              <Input
                id="recovery-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm" htmlFor="recovery-confirm">
              <Input
                id="recovery-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Hint" htmlFor="recovery-hint">
              <Input id="recovery-hint" value={hint} onChange={(e) => setHint(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Set password
              </Button>
            </div>
          </form>
        )}

        {step === 'newkey' && newKey && (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold">Your new recovery key</h1>
            <p className="text-base text-ink-2">The old key no longer works. Save this one.</p>
            <code
              className="mono block rounded-md border border-rule bg-canvas p-3 text-md tracking-[0.06em] select-text"
              data-testid="new-recovery-key"
            >
              {newKey}
            </code>
            <Checkbox
              label="I saved my new recovery key"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            <div className="flex justify-end pt-2">
              <Button variant="primary" disabled={!saved} loading={busy} onClick={finish}>
                Unlock
              </Button>
            </div>
          </div>
        )}

        {step === 'erase' && (
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold">Erase this computer</h1>
            <p className="text-base text-ink-2">
              Without the recovery key the account cannot be recovered. Erasing removes every file,
              setting and account and returns to setup.
            </p>
            <Field label='Type "ERASE" to confirm' htmlFor="erase-confirm">
              <Input
                id="erase-confirm"
                mono
                autoFocus
                value={eraseText}
                onChange={(e) => setEraseText(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep('key')}>
                Back
              </Button>
              <Button
                variant="danger"
                disabled={eraseText !== 'ERASE'}
                loading={busy}
                onClick={() => void kernel.factoryReset()}
              >
                Erase everything
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

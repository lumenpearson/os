import {
  passwordStrength,
  SCREENSAVERS as SCREENSAVER_PRESETS,
  type ScreensaverId,
  screensaverById,
} from '@lumen/kernel';
import { useClipboard, useCurrentUser, useKernel, useSetting } from '@lumen/kernel/react';
import {
  Button,
  cx,
  Dialog,
  Field,
  Input,
  Select,
  type SelectOption,
  SettingsGroup,
  SettingsPage,
  Switch,
} from '@lumen/ui';
import { Check, Copy, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../_sdk';
import { MINUTE_OPTIONS, parseMinutes, rotateCredentials } from '../logic';
import { Row } from '../Row';

const SCREENSAVERS: SelectOption<ScreensaverId>[] = SCREENSAVER_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.name,
}));

function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => {
          // deslop-ignore-next-line 19 a 4px meter segment, the shape the Progress atom uses
          const fill = cx('h-1 flex-1 rounded-full', i < s.score ? 'bg-accent' : 'bg-surface-3');
          return <span key={i} className={fill} />;
        })}
      </div>
      <span className="mono w-16 text-right text-xs text-ink-2">{password ? s.label : ''}</span>
    </div>
  );
}

function RecoveryKeyPanel({ recoveryKey }: { recoveryKey: string }) {
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
    copyText(recoveryKey);
    navigator.clipboard?.writeText(recoveryKey).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        Your new recovery key. It unlocks the account if you forget the password.
      </p>
      <div className="mono select-text rounded-md border border-rule bg-canvas px-3 py-3 text-center text-md tracking-wider text-ink">
        {recoveryKey}
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

type Mode = 'change' | 'recovery';

function CredentialsDialog({
  mode,
  open,
  onClose,
}: {
  mode: Mode;
  open: boolean;
  onClose: () => void;
}) {
  const kernel = useKernel();
  const user = useCurrentUser();
  const { container } = useApp();
  const hasPassword = user?.passwordHash !== null;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState(user?.hint ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setHint(user?.hint ?? '');
    setError(null);
    setBusy(false);
    setRecoveryKey(null);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const mismatch = mode === 'change' && confirm.length > 0 && confirm !== next;
  const canSubmit = mode === 'change' ? next.length > 0 && confirm === next : true;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const key =
        mode === 'change'
          ? await rotateCredentials(kernel, current, next, hint.trim())
          : await rotateCredentials(kernel, current, current);
      if (key === null) setError('The current password is not correct.');
      else setRecoveryKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = recoveryKey
    ? 'New recovery key'
    : mode === 'change'
      ? 'Change password'
      : 'Generate a new recovery key';

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      container={container}
      persistent={busy}
      actions={
        recoveryKey ? (
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
              {mode === 'change' ? 'Change password' : 'Generate key'}
            </Button>
          </>
        )
      }
    >
      {recoveryKey ? (
        <RecoveryKeyPanel recoveryKey={recoveryKey} />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === 'recovery' && (
            <p className="text-ink-2">
              The current key stops working once a new one is made. Confirm your password to
              continue.
            </p>
          )}
          {hasPassword && (
            <Field label="Current password">
              <Input
                data-autofocus
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
          )}
          {mode === 'change' && (
            <>
              <Field label="New password">
                <Input
                  data-autofocus={!hasPassword || undefined}
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
                <StrengthMeter password={next} />
              </Field>
              <Field
                label="Confirm new password"
                error={mismatch ? 'Passwords do not match.' : null}
              >
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
            </>
          )}
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

export function SecurityPage() {
  const kernel = useKernel();
  const [lock, patch] = useSetting('lock');
  const [dialog, setDialog] = useState<Mode | null>(null);

  return (
    <SettingsPage
      title="Lock Screen & Security"
      description="When the screen locks, what it shows, and your password."
    >
      <SettingsGroup title="Lock screen">
        <Row
          id="security.autoLock"
          label="Lock after"
          description="Idle time before the screen locks."
        >
          <Select
            options={MINUTE_OPTIONS}
            value={String(lock.autoLockMinutes)}
            onChange={(v) => patch({ autoLockMinutes: parseMinutes(v) })}
          />
        </Row>
        <Row
          id="security.screensaver"
          label="Screensaver"
          description={screensaverById(lock.screensaver)?.description}
        >
          <Select
            options={SCREENSAVERS}
            value={lock.screensaver}
            onChange={(screensaver) => patch({ screensaver })}
          />
        </Row>
        <Row id="security.screensaverAfter" label="Start screensaver after">
          <Select
            options={MINUTE_OPTIONS}
            value={String(lock.screensaverMinutes)}
            onChange={(v) => patch({ screensaverMinutes: parseMinutes(v) })}
            disabled={lock.screensaver === 'none'}
          />
        </Row>
        <Row id="security.wake" label="Require password on wake">
          <Switch
            checked={lock.requirePasswordOnWake}
            onChange={(e) => patch({ requirePasswordOnWake: e.target.checked })}
          />
        </Row>
        <Row id="security.hint" label="Show password hint" description="After a wrong attempt.">
          <Switch checked={lock.showHint} onChange={(e) => patch({ showHint: e.target.checked })} />
        </Row>
        <Row id="security.clock" label="Show clock">
          <Switch
            checked={lock.showClock}
            onChange={(e) => patch({ showClock: e.target.checked })}
          />
        </Row>
        <Row
          id="security.message"
          label="Lock screen message"
          description="For example who to contact if the machine is found."
          stacked
        >
          <Input
            aria-label="Lock screen message"
            value={lock.message}
            onChange={(e) => patch({ message: e.target.value })}
            placeholder="No message"
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Password">
        <Row
          id="security.password"
          label="Password"
          description="Changing it also makes a new recovery key."
        >
          <Button size="sm" onClick={() => setDialog('change')}>
            Change password…
          </Button>
        </Row>
        <Row
          id="security.recovery"
          label="Recovery key"
          description="Unlocks the account without the password."
        >
          <Button size="sm" onClick={() => setDialog('recovery')}>
            Generate a new recovery key…
          </Button>
        </Row>
        <Row id="security.lockNow" label="Lock now">
          <Button size="sm" icon={<Lock className="size-3.5" />} onClick={() => kernel.lock()}>
            Lock
          </Button>
        </Row>
      </SettingsGroup>

      {dialog && (
        <CredentialsDialog key={dialog} mode={dialog} open onClose={() => setDialog(null)} />
      )}
    </SettingsPage>
  );
}

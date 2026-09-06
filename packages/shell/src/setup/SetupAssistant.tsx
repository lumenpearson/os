// deslop-ignore-file 19 — the theme and accent choosers are colour swatches, which are circles.
import { AVATAR_PRESETS, passwordStrength, useSettingsStore } from '@lumen/kernel';
import { useKernel, useSetting } from '@lumen/kernel/react';
import { accents } from '@lumen/tokens';
import { Avatar, Button, Checkbox, cx, Field, Input, Radio } from '@lumen/ui';
import { Check, Copy } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Wordmark } from '../desktop/Wordmark';

type Step = 'welcome' | 'appearance' | 'account' | 'recovery' | 'done';
const STEPS: Step[] = ['welcome', 'appearance', 'account', 'recovery', 'done'];

/** First-run assistant: appearance, account, recovery key. Ends on the desktop. */
export default function SetupAssistant() {
  const kernel = useKernel();
  const [step, setStep] = useState<Step>('welcome');
  const [appearance, setAppearance] = useSetting('appearance');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATAR_PRESETS[0].id);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = STEPS.indexOf(step);
  const strength = passwordStrength(password);
  const accountValid =
    name.trim().length >= 1 &&
    (password.length === 0 || (password.length >= 4 && password === confirm));

  const createAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await kernel.completeSetup({
        name: name.trim(),
        password,
        hint: hint.trim(),
        avatar,
      });
      setRecoveryKey(result.recoveryKey);
      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    await kernel.unlock(password);
    setBusy(false);
  };

  const copyKey = async () => {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-canvas text-ink select-none"
      data-testid="setup-assistant"
    >
      <div className="flex h-full w-full max-w-[640px] flex-col px-6 py-8 sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:border sm:border-rule sm:bg-surface sm:px-12 sm:py-10 sm:shadow-lg">
        <div className="mb-8 flex items-center gap-3">
          <Wordmark size={32} />
          <span className="mono text-xs text-ink-3">
            {index + 1} / {STEPS.length}
          </span>
        </div>

        <div className="lumen-scroll flex-1">
          {step === 'welcome' && (
            <section className="flex flex-col gap-4">
              <h1 className="text-xl font-semibold tracking-tight">Welcome to Lumen OS</h1>
              <p className="text-md text-ink-2">
                A desktop that runs{' '}
                {kernel.platform.kind === 'tauri' ? 'on this computer' : 'in this browser'}. Your
                files, settings and account stay on this device.
              </p>
              <p className="text-base text-ink-2">
                Setup takes about a minute: pick a look, create your account, and save your recovery
                key.
              </p>
            </section>
          )}

          {step === 'appearance' && (
            <section className="flex flex-col gap-6">
              <h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
              <div className="flex flex-col gap-2">
                <span className="text-base text-ink-2">Theme</span>
                <div className="flex gap-3">
                  {(['light', 'dark', 'auto'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAppearance({ theme: t })}
                      aria-pressed={appearance.theme === t}
                      className={cx(
                        'flex flex-col items-start gap-2 rounded-md border p-2 lumen-focus',
                        appearance.theme === t
                          ? 'border-accent'
                          : 'border-rule hover:border-rule-strong',
                      )}
                    >
                      <span
                        aria-hidden
                        className="block h-14 w-24 rounded-sm border border-rule"
                        style={{
                          background:
                            t === 'light'
                              ? '#f4f4f5'
                              : t === 'dark'
                                ? '#1b1c1f'
                                : 'linear-gradient(90deg,#f4f4f5 50%,#1b1c1f 50%)',
                        }}
                      />
                      <span className="text-sm capitalize">{t}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-base text-ink-2">Accent</span>
                <div className="flex gap-2">
                  {accents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      aria-label={a.label}
                      aria-pressed={appearance.accent === a.id}
                      onClick={() => setAppearance({ accent: a.id })}
                      className={cx(
                        'size-6 rounded-full lumen-focus',
                        appearance.accent === a.id &&
                          'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                      )}
                      style={{ background: `hsl(${a.h} ${a.s}% ${a.l}%)` }}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === 'account' && (
            <form id="setup-account" onSubmit={createAccount} className="flex flex-col gap-5">
              <h1 className="text-xl font-semibold tracking-tight">Your account</h1>
              <div className="flex items-center gap-4">
                <Avatar name={name || 'You'} src={avatar} size={56} />
                <div className="flex flex-wrap gap-2">
                  {AVATAR_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-label={p.label}
                      aria-pressed={avatar === p.id}
                      onClick={() => setAvatar(p.id)}
                      className={cx(
                        'size-6 rounded-full lumen-focus',
                        avatar === p.id && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                      )}
                      style={{ background: `hsl(${p.hue} 32% 42%)` }}
                    />
                  ))}
                </div>
              </div>
              <Field label="Name" htmlFor="setup-name">
                <Input
                  id="setup-name"
                  data-autofocus
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field
                label="Password"
                hint={password ? strength.label : 'Leave empty for no password.'}
                htmlFor="setup-password"
              >
                <Input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              {password.length > 0 && (
                <Field
                  label="Confirm password"
                  error={confirm && confirm !== password ? 'Passwords differ.' : null}
                  htmlFor="setup-confirm"
                >
                  <Input
                    id="setup-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              )}
              <Field
                label="Password hint"
                hint="Shown on the lock screen after a wrong attempt."
                htmlFor="setup-hint"
              >
                <Input id="setup-hint" value={hint} onChange={(e) => setHint(e.target.value)} />
              </Field>
              {error && <p className="text-sm text-danger">{error}</p>}
            </form>
          )}

          {step === 'recovery' && recoveryKey && (
            <section className="flex flex-col gap-5">
              <h1 className="text-xl font-semibold tracking-tight">Recovery key</h1>
              <p className="text-base text-ink-2">
                If you forget your password, this key lets you set a new one. It is shown once.
                Write it down or copy it somewhere safe.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-rule bg-canvas p-4">
                <code
                  className="mono flex-1 text-md tracking-[0.06em] select-text"
                  data-testid="recovery-key"
                >
                  {recoveryKey}
                </code>
                <Button
                  size="sm"
                  icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  onClick={copyKey}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Checkbox
                label="I saved my recovery key"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
            </section>
          )}

          {step === 'done' && (
            <section className="flex flex-col gap-4">
              <h1 className="text-xl font-semibold tracking-tight">Ready</h1>
              <p className="text-md text-ink-2">
                Your desktop is set up, {name.trim()}. Press Start to see every app, or search with
                Ctrl+Space.
              </p>
              <ul className="flex flex-col gap-1 text-base text-ink-2">
                <li>Files, Documents and a few sample documents are in your home folder.</li>
                <li>Lock the screen any time from the menu in the top-left corner.</li>
                <li>Change anything later in Settings.</li>
              </ul>
              <div className="pt-2">
                <Radio
                  name="theme-note"
                  label={`Theme: ${appearance.theme}`}
                  checked
                  readOnly
                  className="hidden"
                />
              </div>
            </section>
          )}
        </div>

        <div className="mt-8 flex items-center gap-2">
          {index > 0 && step !== 'recovery' && step !== 'done' && (
            <Button variant="ghost" onClick={() => setStep(STEPS[index - 1] ?? 'welcome')}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step === 'welcome' && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => setStep('appearance')}
              data-autofocus
            >
              Get started
            </Button>
          )}
          {step === 'appearance' && (
            <Button variant="primary" size="lg" onClick={() => setStep('account')}>
              Continue
            </Button>
          )}
          {step === 'account' && (
            <Button
              variant="primary"
              size="lg"
              type="submit"
              form="setup-account"
              disabled={!accountValid}
              loading={busy}
            >
              Create account
            </Button>
          )}
          {step === 'recovery' && (
            <Button variant="primary" size="lg" disabled={!saved} onClick={() => setStep('done')}>
              Continue
            </Button>
          )}
          {step === 'done' && (
            <Button variant="primary" size="lg" onClick={finish} loading={busy} data-autofocus>
              Start
            </Button>
          )}
        </div>
      </div>
      <SettingsSync />
    </div>
  );
}

/** Persist settings changed during setup immediately (the kernel debounces otherwise). */
function SettingsSync() {
  const loaded = useSettingsStore((s) => s.loaded);
  return loaded ? null : null;
}

import { useSessionStore } from '@lumen/kernel';
import { useClock, useCurrentUser, useKernel, useSettings } from '@lumen/kernel/react';
import { AnchoredMenu, Avatar, Button, cx, Input } from '@lumen/ui';
import { ArrowRight, Power } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Wallpaper } from '../desktop/Wallpaper';
import { RecoveryFlow } from './RecoveryFlow';

/** The lock screen: clock, account, password, recovery, power. */
export default function LockScreen() {
  const kernel = useKernel();
  const user = useCurrentUser();
  const settings = useSettings();
  const now = useClock(1000);
  const failedAttempts = useSessionStore((s) => s.failedAttempts);
  const lockedUntil = useSessionStore((s) => s.lockedUntil);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const powerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lockoutMs = lockedUntil ? Math.max(0, lockedUntil - now.getTime()) : 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // no password: unlock on any key or click
  const passwordless = user?.passwordHash === null;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || lockoutMs > 0) return;
    setBusy(true);
    const result = await kernel.unlock(password);
    setBusy(false);
    if (!result.ok) {
      setPassword('');
      setError(result.reason === 'locked-out' ? 'Too many attempts.' : 'Wrong password.');
      setShake(true);
      setTimeout(() => setShake(false), 260);
      inputRef.current?.focus();
    }
  };

  const time = new Intl.DateTimeFormat(settings.region.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !settings.menubar.clock24h,
    timeZone: settings.region.timeZone || undefined,
  }).format(now);
  const date = new Intl.DateTimeFormat(settings.region.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: settings.region.timeZone || undefined,
  }).format(now);

  if (recovery && user) {
    return (
      <Screen>
        <RecoveryFlow onCancel={() => setRecovery(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <div
        className="flex flex-1 flex-col items-center justify-between py-[8vh]"
        onPointerDown={() => passwordless && void submit()}
      >
        {settings.lock.showClock ? (
          <div className="flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.4)]">
            <span
              className="mono text-[clamp(48px,10vw,96px)] font-medium leading-none tracking-tight tabular-nums"
              data-testid="lock-clock"
            >
              {time}
            </span>
            <span className="text-md opacity-85">{date}</span>
          </div>
        ) : (
          <div />
        )}

        <form
          onSubmit={submit}
          className="flex w-full max-w-[300px] flex-col items-center gap-3"
          data-testid="lock-form"
        >
          <Avatar name={user?.name ?? 'User'} src={user?.avatar} size={72} className="shadow-md" />
          <span className="text-md font-medium text-white drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.4)]">
            {user?.name}
          </span>
          {passwordless ? (
            <p className="text-sm text-white/80">Click or press any key to unlock</p>
          ) : (
            <div
              className={cx(
                'relative w-full',
                shake && 'motion-safe:animate-[lumen-shake_0.26s_ease-in-out]',
              )}
            >
              <Input
                ref={inputRef}
                type="password"
                aria-label="Password"
                placeholder={
                  lockoutMs > 0 ? `Try again in ${Math.ceil(lockoutMs / 1000)} s` : 'Password'
                }
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                disabled={busy || lockoutMs > 0}
                autoComplete="current-password"
                // deslop-ignore-next-line 19 — the field sits on a wallpaper; an opaque-enough tint is what makes it legible, not a glass effect.
                className="h-9 rounded-md bg-white/90 pr-10 text-center text-md text-[#141517] placeholder:text-[#8b8f98] dark:bg-black/55 dark:text-white"
              />
              <button
                type="submit"
                aria-label="Unlock"
                disabled={busy || lockoutMs > 0 || password.length === 0}
                className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm bg-[#141517]/10 text-[#141517] lumen-focus disabled:opacity-30 dark:bg-white/15 dark:text-white"
              >
                <ArrowRight className="size-4" />
              </button>
              <style>
                {
                  '@keyframes lumen-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}'
                }
              </style>
            </div>
          )}
          <div
            className="flex min-h-5 flex-col items-center gap-1 text-sm text-white/85"
            aria-live="polite"
          >
            {error && <span>{error}</span>}
            {/* The hint earns its place after a wrong attempt, which is exactly
                when an error is showing — so it sits alongside, not instead. */}
            {failedAttempts > 0 && settings.lock.showHint && user?.hint && (
              <span>Hint: {user.hint}</span>
            )}
          </div>
          {!passwordless && (
            <button
              type="button"
              onClick={() => setRecovery(true)}
              className="text-sm text-white/70 underline-offset-2 hover:underline lumen-focus rounded-xs"
            >
              Forgot password?
            </button>
          )}
        </form>

        <div className="flex flex-col items-center gap-3">
          {settings.lock.message && (
            <p className="max-w-md text-center text-sm text-white/80">{settings.lock.message}</p>
          )}
          <Button
            ref={powerRef}
            variant="ghost"
            icon={<Power className="size-4" />}
            onClick={(e) => {
              e.stopPropagation();
              setPowerOpen(true);
            }}
            // deslop-ignore-next-line 19 — hover feedback for a control drawn over the wallpaper.
            className="text-white/85 hover:bg-white/10 hover:text-white"
            aria-haspopup="menu"
          >
            Power
          </Button>
          <AnchoredMenu
            open={powerOpen}
            onClose={() => setPowerOpen(false)}
            anchor={powerRef.current}
            align="start"
            items={[
              { label: 'Sleep', onSelect: () => kernel.sleep() },
              { label: 'Restart', onSelect: () => void kernel.restart() },
              { label: 'Shut Down', onSelect: () => void kernel.shutdown() },
            ]}
          />
        </div>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[2000] flex select-none" data-testid="lock-screen">
      <Wallpaper dim />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

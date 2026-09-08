import { type Notification, useNotificationStore, useRegistryStore } from '@lumen/kernel';
import { useNotifications, useSettings } from '@lumen/kernel/react';
import { Button, cx, IconButton, useDeparting } from '@lumen/ui';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { playSound } from '../sounds';

/** Transient banners in the top-right corner. Hover pauses the timer. */
export function Banners() {
  const { items, banners } = useNotifications();
  const settings = useSettings();
  const live = banners
    .map((id) => items.find((n) => n.id === id))
    .filter((n): n is Notification => Boolean(n))
    .slice(-4);
  // Dismissed banners keep their place for the length of their exit; see
  // `useDeparting`. This is the one list in the shell that empties itself, so
  // it is the one a person watches things leave most often.
  const visible = useDeparting(live, (n) => n.id);
  if (settings.notifications.doNotDisturb) return null;
  return (
    <div
      data-over-page
      className="pointer-events-none absolute right-3 top-[calc(var(--lumen-menubar-h)+8px)] z-[1500] flex w-[min(340px,calc(100vw-24px))] flex-col gap-2"
      aria-live="polite"
      data-testid="banners"
    >
      {visible.map(({ key, item, present }) => (
        <Banner
          key={key}
          notification={item}
          leaving={!present}
          showPreview={settings.notifications.showPreviews}
          sound={settings.notifications.sound && settings.sound.uiSounds && !settings.sound.muted}
        />
      ))}
    </div>
  );
}

function Banner({
  notification: n,
  showPreview,
  sound,
  leaving,
}: {
  notification: Notification;
  showPreview: boolean;
  sound: boolean;
  /** True once dismissed: still drawn, on its way out, and no longer timed. */
  leaving: boolean;
}) {
  const app = useRegistryStore((s) => s.apps[n.appId]);
  const dismiss = useNotificationStore((s) => s.dismissBanner);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeout = n.timeout ?? 6000;

  useEffect(() => {
    if (sound) playSound('notify');
  }, [sound]);

  useEffect(() => {
    if (timeout <= 0 || leaving) return;
    const start = () => {
      timer.current = setTimeout(() => dismiss(n.id), timeout);
    };
    start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [n.id, timeout, dismiss, leaving]);

  const Icon = app?.icon;
  return (
    <div
      role="status"
      data-anim="panel"
      className={cx(
        'pointer-events-auto flex gap-3 rounded-lg border border-rule bg-surface p-3 text-ink shadow-lg',
        leaving ? 'lumen-pop-exit' : 'lumen-pop-enter',
      )}
      style={{ ['--lumen-pop-origin' as string]: 'top right' }}
      onPointerEnter={() => timer.current && clearTimeout(timer.current)}
      onPointerLeave={() => {
        if (timeout > 0) timer.current = setTimeout(() => dismiss(n.id), 2000);
      }}
    >
      {Icon && <Icon size={28} className="mt-0.5" />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start gap-2">
          <span className="truncate-1 flex-1 text-base font-medium">{n.title}</span>
          <span className="mono text-2xs text-ink-3">{app?.name}</span>
        </div>
        {showPreview && n.body && <p className="text-sm text-ink-2 line-clamp-3">{n.body}</p>}
        {n.actions && n.actions.length > 0 && (
          <div className="flex gap-1.5 pt-1.5">
            {n.actions.map((a) => (
              <Button
                key={a.id}
                size="sm"
                onClick={() => {
                  n.onAction?.(a.id);
                  dismiss(n.id);
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <IconButton label="Dismiss" size="sm" onClick={() => dismiss(n.id)} className="-mr-1 -mt-1">
        <X />
      </IconButton>
    </div>
  );
}

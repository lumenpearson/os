import { formatRelative } from '@lumen/apps';
import { type Notification, useNotificationStore, useRegistryStore } from '@lumen/kernel';
import { useNotifications, useRuntimeSettings, useSetting } from '@lumen/kernel/react';
import { Button, cx, IconButton, Switch, useClickOutside, useEscape } from '@lumen/ui';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useShellStore } from '../shellStore';

/** The notification list, grouped by app, with Do Not Disturb. */
export function NotificationCenter() {
  const open = useShellStore((s) => s.notificationCenter);
  const toggle = useShellStore((s) => s.toggle);
  const { items } = useNotifications();
  const settings = useRuntimeSettings();
  const [notif, setNotif] = useSetting('notifications');
  const apps = useRegistryStore((s) => s.apps);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const clearApp = useNotificationStore((s) => s.clearApp);
  const ref = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [ref], []);
  useClickOutside(refs, () => toggle('notificationCenter', false), open);
  useEscape(() => toggle('notificationCenter', false), open);

  useEffect(() => {
    if (open) markAllRead();
  }, [open, markAllRead]);

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of items) {
      const list = map.get(n.appId) ?? [];
      list.push(n);
      map.set(n.appId, list);
    }
    return [...map.entries()];
  }, [items]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      data-testid="notification-center"
      className={cx(
        'absolute right-2 top-[calc(var(--lumen-menubar-h)+6px)] z-[1200] flex max-h-[calc(100vh-var(--lumen-menubar-h)-var(--lumen-taskbar-h)-20px)] w-[min(360px,calc(100vw-16px))] flex-col rounded-lg border border-rule bg-chrome text-ink shadow-lg lumen-pop-enter',
        !settings.appearance.reduceTransparency && 'surface-blur',
      )}
      style={{ ['--lumen-pop-origin' as string]: 'top right' }}
    >
      <div className="flex items-center gap-3 border-b border-rule px-3 py-2">
        <span className="text-base font-medium">Notifications</span>
        <div className="flex-1" />
        <Switch
          label="Do Not Disturb"
          checked={notif.doNotDisturb}
          onChange={(e) => setNotif({ doNotDisturb: e.target.checked })}
          className="text-sm"
        />
      </div>
      <div className="lumen-scroll flex-1 p-2">
        {groups.length === 0 && (
          <p className="px-2 py-10 text-center text-sm text-ink-3">No notifications</p>
        )}
        {groups.map(([appId, list]) => {
          const app = apps[appId];
          const Icon = app?.icon;
          return (
            <section key={appId} className="mb-2 rounded-md border border-rule bg-surface/80">
              <header className="flex items-center gap-2 px-3 py-1.5">
                {Icon && <Icon size={16} />}
                <span className="text-sm font-medium">{app?.name ?? appId}</span>
                <IconButton
                  label={`Clear ${app?.name ?? appId}`}
                  size="sm"
                  className="ml-auto"
                  onClick={() => clearApp(appId)}
                >
                  <X />
                </IconButton>
              </header>
              <ul className="divide-y divide-rule">
                {list.map((n) => (
                  <li key={n.id} className="group flex gap-2 px-3 py-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate-1 text-base">{n.title}</span>
                      {n.body && <span className="text-sm text-ink-2 line-clamp-2">{n.body}</span>}
                      <span className="mono pt-0.5 text-2xs text-ink-3">
                        {formatRelative(n.createdAt)}
                      </span>
                    </div>
                    <IconButton
                      label="Remove"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => remove(n.id)}
                    >
                      <X />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="border-t border-rule p-2">
          <Button size="sm" variant="ghost" block onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

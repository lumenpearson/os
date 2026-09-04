// deslop-ignore-file 09 13 — <Mark> is the product wordmark; the scanner matches the substring 'mark'.
import {
  formatShortcut,
  type MenuItemTemplate,
  type MenuTemplate,
  useMenuStore,
  useRegistryStore,
  useWindowStore,
} from '@lumen/kernel';
import {
  useClock,
  useCurrentUser,
  useFocusedWindow,
  useKernel,
  useSettings,
  useUnreadCount,
} from '@lumen/kernel/react';
import { cx, type MenuEntry, MenuList, Popover, useClickOutside } from '@lumen/ui';
import {
  Bell,
  BluetoothOff,
  Search,
  SlidersHorizontal,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mark } from '../desktop/Wordmark';
import { useShellStore } from '../shellStore';
import { BatteryStatus } from './BatteryStatus';
import { ClockPopover } from './ClockPopover';

/**
 * The top bar: the Lumen menu, the focused app's menus, and status items.
 * Menus open on click and switch on hover while one is open, like macOS.
 */
export function MenuBar() {
  const kernel = useKernel();
  const settings = useSettings();
  const focused = useFocusedWindow();
  const app = useRegistryStore((s) => (focused ? s.apps[focused.appId] : undefined));
  const appMenus = useMenuStore((s) => (focused ? s.byWindow[focused.id] : undefined));
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [barRef], []);
  useClickOutside(refs, () => setOpen(null), open !== null);

  const toEntries = useCallback(
    (items: MenuItemTemplate[]): MenuEntry[] =>
      items.map((it) => ({
        id: it.id,
        type: it.type,
        label: it.label,
        shortcut: it.shortcut ? formatShortcut(it.shortcut, settings.keyboard.modifier) : undefined,
        enabled: it.enabled,
        checked: it.checked,
        danger: it.danger,
        onSelect: it.onSelect,
        submenu: it.submenu ? toEntries(it.submenu) : undefined,
      })),
    [settings.keyboard.modifier],
  );

  const systemMenu: MenuEntry[] = [
    { label: 'About This Computer', onSelect: () => void kernel.launch('lumen.sysinfo') },
    { type: 'separator' },
    { label: 'System Settings…', onSelect: () => void kernel.launch('lumen.settings') },
    { label: 'Software Center…', onSelect: () => void kernel.launch('lumen.software') },
    { type: 'separator' },
    {
      label: 'Task Manager…',
      shortcut: formatShortcut('Mod+Shift+Escape', settings.keyboard.modifier),
      onSelect: () => void kernel.launch('lumen.taskmanager'),
    },
    { type: 'separator' },
    { label: 'Sleep', onSelect: () => kernel.sleep() },
    { label: 'Restart…', onSelect: () => void kernel.restart() },
    { label: 'Shut Down…', onSelect: () => void kernel.shutdown() },
    { type: 'separator' },
    {
      label: 'Lock Screen',
      shortcut: formatShortcut('Mod+Alt+L', settings.keyboard.modifier),
      onSelect: () => kernel.lock(),
    },
  ];

  const appMenu: MenuEntry[] | null = app
    ? [
        {
          label: `About ${app.name}`,
          onSelect: () => void kernel.launch('lumen.help', { section: 'apps' }),
        },
        { type: 'separator' },
        {
          label: 'Hide',
          shortcut: formatShortcut('Mod+M', settings.keyboard.modifier),
          onSelect: () => focused && useWindowStore.getState().minimize(focused.id),
        },
        {
          label: 'New Window',
          enabled: !app.singleton,
          onSelect: () => void kernel.launch(app.id),
        },
        { type: 'separator' },
        {
          label: `Quit ${app.name}`,
          shortcut: formatShortcut('Mod+Q', settings.keyboard.modifier),
          onSelect: () => focused && void kernel.quitApp(focused.pid),
        },
      ]
    : null;

  const menus: Array<{
    id: string;
    label: React.ReactNode;
    items: MenuEntry[];
    bold?: boolean;
    mark?: boolean;
  }> = [
    // deslop-ignore-next-line 24 — Mark is the product's own wordmark (a geometric L), a chosen brand asset.
    { id: 'system', label: <Mark size={16} />, items: systemMenu, mark: true },
    ...(app && appMenu ? [{ id: 'app', label: app.name, items: appMenu, bold: true }] : []),
    ...(appMenus ?? []).map((m: MenuTemplate) => ({
      id: m.id,
      label: m.label,
      items: toEntries(m.items),
    })),
  ];

  // Close the open menu when focus moves to another window. Keyed on the id
  // alone: re-running on every bounds or title change would close it mid-use.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the id is the intended trigger
  useEffect(() => {
    setOpen(null);
  }, [focused?.id]);

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Menu bar"
      data-testid="menubar"
      className={cx(
        'absolute inset-x-0 top-0 z-[1001] flex h-(--lumen-menubar-h) items-stretch bg-chrome text-ink select-none',
        !settings.appearance.reduceTransparency && 'surface-blur',
      )}
      onKeyDown={(e) => {
        if (open === null) return;
        const idx = menus.findIndex((m) => m.id === open);
        if (e.key === 'ArrowRight') setOpen(menus[(idx + 1) % menus.length]?.id ?? null);
        if (e.key === 'ArrowLeft')
          setOpen(menus[(idx - 1 + menus.length) % menus.length]?.id ?? null);
      }}
    >
      <div className="flex items-stretch pl-2">
        {menus.map((m) => (
          <MenuBarItem
            key={m.id}
            id={m.id}
            open={open === m.id}
            anyOpen={open !== null}
            onOpen={() => setOpen(m.id)}
            onClose={() => setOpen(null)}
            items={m.items}
            bold={m.bold}
            mark={m.mark}
          >
            {m.label}
          </MenuBarItem>
        ))}
      </div>
      <div className="flex-1" />
      <StatusItems />
    </div>
  );
}

function MenuBarItem({
  id,
  open,
  anyOpen,
  onOpen,
  onClose,
  items,
  bold,
  mark,
  children,
}: {
  id: string;
  open: boolean;
  anyOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  items: MenuEntry[];
  bold?: boolean;
  mark?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        data-menu-id={id}
        onPointerDown={(e) => {
          e.preventDefault();
          if (open) onClose();
          else onOpen();
        }}
        onPointerEnter={() => {
          if (anyOpen && !open) onOpen();
        }}
        className={cx(
          'flex items-center px-2.5 text-base lumen-focus rounded-none',
          'transition-colors duration-(--duration-fast)',
          open ? 'bg-selection' : 'hover:bg-surface-2/60',
          bold && 'font-semibold',
          mark && 'px-3',
        )}
      >
        {children}
      </button>
      {open && ref.current && (
        <div
          className="fixed z-[1100]"
          style={{
            left: ref.current.getBoundingClientRect().left,
            top: ref.current.getBoundingClientRect().bottom + 2,
          }}
        >
          <MenuList items={items} onClose={onClose} />
        </div>
      )}
    </>
  );
}

function StatusItems() {
  const kernel = useKernel();
  const settings = useSettings();
  const unread = useUnreadCount();
  const user = useCurrentUser();
  const now = useClock(settings.menubar.showSeconds ? 1000 : 10_000);
  const toggle = useShellStore((s) => s.toggle);
  const [clockOpen, setClockOpen] = useState(false);
  const clockRef = useRef<HTMLButtonElement>(null);

  const time = new Intl.DateTimeFormat(settings.region.locale, {
    hour: 'numeric',
    minute: '2-digit',
    second: settings.menubar.showSeconds ? '2-digit' : undefined,
    hour12: !settings.menubar.clock24h,
    timeZone: settings.region.timeZone || undefined,
  }).format(now);
  const date = new Intl.DateTimeFormat(settings.region.locale, {
    weekday: settings.menubar.showDayOfWeek ? 'short' : undefined,
    day: settings.menubar.showDate ? 'numeric' : undefined,
    month: settings.menubar.showDate ? 'short' : undefined,
    timeZone: settings.region.timeZone || undefined,
  }).format(now);

  const item =
    'flex h-full items-center px-1.5 text-ink-2 hover:text-ink hover:bg-surface-2/60 lumen-focus [&>svg]:size-4 [&>svg]:stroke-[1.75]';
  const volume = settings.sound.muted ? VolumeX : settings.sound.volume > 0.5 ? Volume2 : Volume1;
  const VolumeIcon = volume;

  return (
    <div className="flex items-stretch pr-2" data-testid="status-items">
      {settings.menubar.showUser && user && (
        <span className="mono flex items-center px-2 text-xs text-ink-2">{user.username}</span>
      )}
      {settings.menubar.showNetwork && (
        <button
          type="button"
          className={item}
          aria-label={
            settings.network.wifi && !settings.network.airplane
              ? `Wi-Fi: ${settings.network.ssid}`
              : 'Wi-Fi off'
          }
          title={settings.network.ssid}
          onClick={() => toggle('controlCenter')}
        >
          {settings.network.airplane ? (
            <BluetoothOff />
          ) : settings.network.wifi ? (
            <Wifi />
          ) : (
            <WifiOff />
          )}
        </button>
      )}
      {settings.menubar.showSound && (
        <button
          type="button"
          className={item}
          aria-label={`Volume ${Math.round(settings.sound.volume * 100)}%`}
          onClick={() => toggle('controlCenter')}
        >
          <VolumeIcon />
        </button>
      )}
      {settings.menubar.showBattery && <BatteryStatus className={item} />}
      <button
        type="button"
        className={item}
        aria-label="Search"
        onClick={() => toggle('spotlight')}
      >
        <Search />
      </button>
      <button
        type="button"
        className={item}
        aria-label="Control Center"
        data-testid="control-center-button"
        onClick={() => toggle('controlCenter')}
      >
        <SlidersHorizontal />
      </button>
      <button
        type="button"
        className={cx(item, 'relative')}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        onClick={() => toggle('notificationCenter')}
      >
        <Bell />
        {unread > 0 && (
          // deslop-ignore-next-line 19 — an unread dot is a dot: flat, no halo, no pulse.
          <span className="absolute right-1 top-1.5 size-1.5 rounded-full bg-accent" />
        )}
      </button>
      {settings.menubar.showClock && (
        <button
          ref={clockRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={clockOpen}
          onClick={() => setClockOpen((v) => !v)}
          className={cx(item, 'mono gap-2 px-2 text-sm tabular-nums text-ink')}
          data-testid="menubar-clock"
        >
          {date && <span className="text-ink-2">{date}</span>}
          <span>{time}</span>
        </button>
      )}
      <Popover
        open={clockOpen}
        onClose={() => setClockOpen(false)}
        anchor={clockRef.current}
        width={300}
      >
        <ClockPopover
          onOpenCalendar={() => {
            setClockOpen(false);
            void kernel.launch('lumen.calendar');
          }}
        />
      </Popover>
    </div>
  );
}

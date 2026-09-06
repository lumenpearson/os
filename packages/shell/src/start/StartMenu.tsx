import { ManifestIcon } from '@lumen/apps';
import { type AppCategory, searchApps } from '@lumen/kernel';
import {
  useApps,
  useCurrentUser,
  useInstalledApps,
  useKernel,
  useRuntimeSettings,
} from '@lumen/kernel/react';
import { AnchoredMenu, Avatar, cx, SearchField, useClickOutside, useEscape } from '@lumen/ui';
import { basename } from '@lumen/vfs';
import { Power, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShellStore } from '../shellStore';

const CATEGORY_LABEL: Record<AppCategory, string> = {
  system: 'System',
  utilities: 'Utilities',
  office: 'Office',
  media: 'Media',
  internet: 'Internet',
  developer: 'Developer',
  games: 'Games',
  user: 'Installed',
};

/** The Start menu: search, all apps by category, recent files, account and power. */
export function StartMenu() {
  const kernel = useKernel();
  const open = useShellStore((s) => s.startMenu);
  const toggle = useShellStore((s) => s.toggle);
  const settings = useRuntimeSettings();
  const apps = useApps();
  const installed = useInstalledApps();
  const user = useCurrentUser();
  const [query, setQuery] = useState('');
  const [powerOpen, setPowerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const powerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const refs = useMemo(() => [ref], []);
  useClickOutside(
    refs,
    () => {
      if (open && !powerOpen) toggle('startMenu', false);
    },
    open,
  );
  useEscape(() => toggle('startMenu', false), open);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => (query.trim() ? searchApps(query, 12) : null), [query]);
  const grouped = useMemo(() => {
    const map = new Map<AppCategory, typeof apps>();
    for (const a of apps) {
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    const order: AppCategory[] = [
      'system',
      'office',
      'utilities',
      'internet',
      'media',
      'developer',
      'games',
      'user',
    ];
    return order.filter((c) => map.has(c)).map((c) => ({ category: c, apps: map.get(c) ?? [] }));
  }, [apps]);
  const recents = kernel.state.recents.slice(0, 6);

  if (!open) return null;
  const pos = settings.taskbar.position;
  const launch = (id: string) => {
    toggle('startMenu', false);
    void kernel.launch(id);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Start menu"
      data-testid="start-menu"
      className={cx(
        // deslop-ignore-next-line 22 — border and radius are on this element; the clipped children have no border of their own.
        'absolute z-[1200] flex w-[min(560px,calc(100vw-16px))] flex-col overflow-hidden rounded-lg border border-rule bg-chrome text-ink shadow-lg lumen-pop-enter',
        !settings.appearance.reduceTransparency && 'surface-blur',
        pos === 'bottom' && 'bottom-[calc(var(--lumen-taskbar-h)+8px)] left-1/2 -translate-x-1/2',
        pos === 'left' &&
          'left-[calc(var(--lumen-taskbar-h)+8px)] top-[calc(var(--lumen-menubar-h)+8px)]',
        pos === 'right' &&
          'right-[calc(var(--lumen-taskbar-h)+8px)] top-[calc(var(--lumen-menubar-h)+8px)]',
      )}
      style={{
        ['--lumen-pop-origin' as string]: pos === 'bottom' ? 'bottom center' : 'top left',
        maxHeight:
          'min(640px, calc(100vh - var(--lumen-menubar-h) - var(--lumen-taskbar-h) - 24px))',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && results?.[0]) launch(results[0].id);
      }}
    >
      <div className="p-3 pb-2">
        <SearchField
          ref={inputRef}
          value={query}
          onChange={setQuery}
          placeholder="Search apps, files, settings"
          aria-label="Search"
        />
      </div>
      <div className="lumen-scroll min-h-0 flex-1 px-3 pb-3">
        {results ? (
          <ul className="flex flex-col gap-px" aria-label="Results">
            {results.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-ink-3">No apps match “{query}”</li>
            )}
            {results.map((a) => (
              <li key={a.id}>
                <AppRow
                  name={a.name}
                  description={a.description}
                  icon={<a.icon size={28} />}
                  onSelect={() => launch(a.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(({ category, apps: list }) => (
              <section key={category}>
                <h2 className="mono px-2 pb-1 text-2xs uppercase tracking-[0.08em] text-ink-3">
                  {CATEGORY_LABEL[category]}
                </h2>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1">
                  {list.map((a) => (
                    <li key={a.id}>
                      <AppTile
                        name={a.name}
                        icon={<a.icon size={36} />}
                        onSelect={() => launch(a.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {installed.length > 0 && (
              <section>
                <h2 className="mono px-2 pb-1 text-2xs uppercase tracking-[0.08em] text-ink-3">
                  Installed
                </h2>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1">
                  {installed.map(({ manifest }) => (
                    <li key={manifest.id}>
                      <AppTile
                        name={manifest.name}
                        icon={<ManifestIcon size={36} name={manifest.name} icon={manifest.icon} />}
                        onSelect={() => launch(manifest.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {settings.taskbar.showRecents && recents.length > 0 && (
              <section>
                <h2 className="mono px-2 pb-1 text-2xs uppercase tracking-[0.08em] text-ink-3">
                  Recent
                </h2>
                <ul className="flex flex-col gap-px">
                  {recents.map((r) => (
                    <li key={r.path}>
                      <AppRow
                        name={basename(r.path)}
                        description={r.path}
                        mono
                        onSelect={() => {
                          toggle('startMenu', false);
                          void kernel.open(r.path);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-rule px-3 py-2">
        <button
          type="button"
          onClick={() => launch('lumen.settings')}
          className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-base hover:bg-surface-2 lumen-focus"
          aria-label={`Account: ${user?.name ?? ''}`}
        >
          <Avatar name={user?.name ?? 'User'} src={user?.avatar} size={24} />
          <span>{user?.name}</span>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Settings"
          onClick={() => launch('lumen.settings')}
          className="flex size-7 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 hover:text-ink lumen-focus"
        >
          <Settings2 className="size-4" />
        </button>
        <button
          ref={powerRef}
          type="button"
          aria-label="Power"
          aria-haspopup="menu"
          onClick={() => setPowerOpen(true)}
          className="flex size-7 items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 hover:text-ink lumen-focus"
        >
          <Power className="size-4" />
        </button>
        <AnchoredMenu
          open={powerOpen}
          onClose={() => setPowerOpen(false)}
          anchor={powerRef.current}
          align="end"
          items={[
            {
              label: 'Lock',
              onSelect: () => {
                toggle('startMenu', false);
                kernel.lock();
              },
            },
            {
              label: 'Sleep',
              onSelect: () => {
                toggle('startMenu', false);
                kernel.sleep();
              },
            },
            { type: 'separator' },
            { label: 'Restart…', onSelect: () => void kernel.restart() },
            { label: 'Shut Down…', onSelect: () => void kernel.shutdown() },
          ]}
        />
      </div>
    </div>
  );
}

function AppTile({
  name,
  icon,
  onSelect,
}: {
  name: string;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col items-center gap-1.5 rounded-md px-1 py-2 hover:bg-surface-2 lumen-focus"
      title={name}
    >
      {icon}
      <span className="w-full truncate-1 text-center text-sm">{name}</span>
    </button>
  );
}

function AppRow({
  name,
  description,
  icon,
  mono,
  onSelect,
}: {
  name: string;
  description?: string;
  icon?: React.ReactNode;
  mono?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-surface-2 lumen-focus"
    >
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className="truncate-1 text-base">{name}</span>
        {description && (
          <span className={cx('truncate-1 text-sm text-ink-3', mono && 'mono text-xs')}>
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

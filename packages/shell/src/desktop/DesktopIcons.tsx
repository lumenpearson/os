import { FileTypeIcon } from '@lumen/apps';
import { useClipboardStore, WALLPAPERS } from '@lumen/kernel';
import { useKernel, useSetting, useSettings, useVfs, useWorkArea } from '@lumen/kernel/react';
import { AnchoredMenu, cx, type MenuEntry, useDialogs } from '@lumen/ui';
import { basename, type DirEntry, dirname, isValidName, join } from '@lumen/vfs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ICON_SIZES = { small: 56, medium: 72, large: 96 } as const;

/** Files in ~/Desktop as icons with drag-to-arrange, rename and a context menu. */
export function DesktopIcons() {
  const kernel = useKernel();
  const vfs = useVfs();
  const settings = useSettings();
  const [desktop, setDesktop] = useSetting('desktop');
  const dialogs = useDialogs();
  const area = useWorkArea();
  const dir = join(kernel.home, 'Desktop');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; entry: DirEntry | null } | null>(
    null,
  );
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    () => kernel.state.desktopIcons,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    vfs
      .readDir(dir)
      .then((list) =>
        setEntries(list.filter((e) => settings.files.showHidden || !e.name.startsWith('.'))),
      )
      .catch(() => setEntries([]));
  }, [vfs, dir, settings.files.showHidden]);

  useEffect(() => {
    refresh();
    return vfs.subscribe((e) => {
      if (dirname(e.path) === dir || (e.to && dirname(e.to) === dir)) refresh();
    });
  }, [vfs, dir, refresh]);

  const size = ICON_SIZES[desktop.iconSize];
  const cell = { w: size + 24, h: size + 36 };
  const sorted = useMemo(() => {
    const list = [...entries];
    if (desktop.sortBy === 'date') list.sort((a, b) => b.modifiedAt - a.modifiedAt);
    else if (desktop.sortBy === 'kind')
      list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    return list;
  }, [entries, desktop.sortBy]);

  const layout = useMemo(() => {
    const rows = Math.max(1, Math.floor((area.height - 16) / cell.h));
    const taken = new Set(Object.values(positions).map((p) => `${p.x},${p.y}`));
    let auto = 0;
    return sorted.map((e) => {
      const saved = positions[e.path];
      if (saved) return { entry: e, x: saved.x, y: saved.y };
      let slot = auto;
      for (;;) {
        const x = Math.floor(slot / rows);
        const y = slot % rows;
        if (!taken.has(`${x},${y}`)) {
          auto = slot + 1;
          return { entry: e, x, y };
        }
        slot++;
      }
    });
  }, [sorted, positions, area.height, cell.h]);

  if (!desktop.showIcons) return null;

  const persist = (next: Record<string, { x: number; y: number }>) => {
    setPositions(next);
    kernel.updateState({ desktopIcons: next });
  };

  const startDrag = (e: React.PointerEvent, entry: DirEntry, gx: number, gy: number) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    let raf = 0;
    let dx = 0;
    let dy = 0;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      dx = ev.clientX - start.x;
      dy = ev.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.style.zIndex = '5';
        });
      }
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
      el.style.zIndex = '';
      if (!moved) return;
      const rows = Math.max(1, Math.floor((area.height - 16) / cell.h));
      const cols = Math.max(1, Math.floor((area.width - 16) / cell.w));
      const nx = Math.max(0, Math.min(cols - 1, gx + Math.round(dx / cell.w)));
      const ny = Math.max(0, Math.min(rows - 1, gy + Math.round(dy / cell.h)));
      // drop onto another folder moves the file
      const target = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>('[data-desktop-path]');
      const targetPath = target?.dataset.desktopPath;
      if (targetPath && targetPath !== entry.path) {
        const t = entries.find((x) => x.path === targetPath);
        if (t?.kind === 'directory') {
          void vfs.moveInto(entry.path, t.path);
          return;
        }
      }
      const occupied = layout.find((l) => l.x === nx && l.y === ny && l.entry.path !== entry.path);
      if (occupied) return;
      persist({ ...positions, [entry.path]: { x: nx, y: ny } });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const commitRename = async (entry: DirEntry, name: string) => {
    setRenaming(null);
    const n = name.trim();
    if (!n || n === entry.name || !isValidName(n)) return;
    try {
      await vfs.rename(entry.path, join(dir, n));
    } catch (err) {
      await dialogs.alert({
        title: 'Could not rename',
        message: String(err instanceof Error ? err.message : err),
      });
    }
  };

  const itemMenu = (entry: DirEntry): MenuEntry[] => [
    { label: 'Open', onSelect: () => void kernel.open(entry.path) },
    { type: 'separator' },
    {
      label: 'Get Info',
      onSelect: () =>
        void kernel.launch('lumen.files', { path: dir, select: entry.path, info: true }),
    },
    { label: 'Rename', onSelect: () => setRenaming(entry.path) },
    { label: 'Duplicate', onSelect: () => void vfs.copyInto(entry.path, dir) },
    { label: 'Copy', onSelect: () => useClipboardStore.getState().copyFiles([entry.path], 'copy') },
    { type: 'separator' },
    { label: 'Move to Trash', danger: true, onSelect: () => void vfs.trash(entry.path) },
  ];

  const backgroundMenu: MenuEntry[] = [
    { label: 'New Folder', onSelect: () => void vfs.createFolder(dir) },
    { label: 'New Text File', onSelect: () => void vfs.createFile(dir, 'untitled.txt') },
    {
      label: 'Paste',
      enabled: useClipboardStore.getState().item?.kind === 'files',
      onSelect: async () => {
        const item = useClipboardStore.getState().item;
        if (item?.kind !== 'files' || !item.files) return;
        for (const p of item.files.paths) {
          if (item.files.operation === 'cut') await vfs.moveInto(p, dir);
          else await vfs.copyInto(p, dir);
        }
        if (item.files.operation === 'cut') useClipboardStore.getState().clear();
      },
    },
    { type: 'separator' },
    { label: 'Clean Up', onSelect: () => persist({}) },
    {
      label: 'Sort By',
      submenu: (['name', 'kind', 'date'] as const).map((k) => ({
        label: k[0]?.toUpperCase() + k.slice(1),
        type: 'radio' as const,
        checked: desktop.sortBy === k,
        onSelect: () => setDesktop({ sortBy: k }),
      })),
    },
    {
      label: 'Icon Size',
      submenu: (['small', 'medium', 'large'] as const).map((k) => ({
        label: k[0]?.toUpperCase() + k.slice(1),
        type: 'radio' as const,
        checked: desktop.iconSize === k,
        onSelect: () => setDesktop({ iconSize: k }),
      })),
    },
    { type: 'separator' },
    {
      label: 'Change Wallpaper',
      submenu: [
        ...WALLPAPERS.map((w) => ({
          label: w.name,
          type: 'radio' as const,
          checked: desktop.wallpaper === w.id,
          onSelect: () => setDesktop({ wallpaper: w.id }),
        })),
        { type: 'separator' as const },
        {
          label: 'More in Settings…',
          onSelect: () => void kernel.launch('lumen.settings', { section: 'wallpaper' }),
        },
      ],
    },
    { label: 'Open in Files', onSelect: () => void kernel.launch('lumen.files', { path: dir }) },
  ];

  return (
    <div
      ref={rootRef}
      className="absolute"
      style={{
        left: area.x + 8,
        top: area.y + 8,
        width: area.width - 16,
        height: area.height - 16,
      }}
      data-testid="desktop-icons"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSelected(new Set());
      }}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        setMenu({ at: { x: e.clientX, y: e.clientY }, entry: null });
      }}
    >
      {layout.map(({ entry, x, y }) => {
        const isSelected = selected.has(entry.path);
        const label =
          settings.files.showExtensions || entry.kind === 'directory'
            ? entry.name
            : basename(entry.name, true);
        return (
          <div
            key={entry.path}
            data-desktop-path={entry.path}
            role="button"
            tabIndex={0}
            aria-label={entry.name}
            aria-selected={isSelected}
            className={cx(
              'absolute flex flex-col items-center gap-1 rounded-md p-1 outline-none lumen-focus',
              isSelected && 'bg-white/15',
            )}
            style={{ left: x * cell.w, top: y * cell.h, width: cell.w }}
            onPointerDown={(e) => {
              setSelected(
                e.ctrlKey || e.metaKey ? new Set([...selected, entry.path]) : new Set([entry.path]),
              );
              startDrag(e, entry, x, y);
            }}
            onDoubleClick={() => void kernel.open(entry.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void kernel.open(entry.path);
              if (e.key === 'F2') setRenaming(entry.path);
              if (e.key === 'Delete' || e.key === 'Backspace') void vfs.trash(entry.path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(new Set([entry.path]));
              setMenu({ at: { x: e.clientX, y: e.clientY }, entry });
            }}
          >
            <FileTypeIcon entry={entry} size={size * 0.7} />
            {renaming === entry.path ? (
              <input
                autoFocus
                defaultValue={entry.name}
                aria-label="New name"
                className="mono w-full rounded-xs border border-accent bg-surface px-1 text-center text-xs text-ink outline-none"
                onFocus={(e) =>
                  e.currentTarget.setSelectionRange(0, basename(entry.name, true).length)
                }
                onBlur={(e) => void commitRename(entry, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename(entry, e.currentTarget.value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className={cx(
                  'line-clamp-2 w-full break-words text-center text-xs leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.7)]',
                  isSelected && 'rounded-xs bg-accent text-accent-ink [text-shadow:none]',
                )}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
      <AnchoredMenu
        open={menu !== null}
        onClose={() => setMenu(null)}
        at={menu?.at ?? null}
        items={menu?.entry ? itemMenu(menu.entry) : backgroundMenu}
      />
    </div>
  );
}

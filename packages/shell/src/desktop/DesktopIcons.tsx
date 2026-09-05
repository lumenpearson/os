import { FileTypeIcon } from '@lumen/apps';
import { useClipboardStore, WALLPAPERS } from '@lumen/kernel';
import { useKernel, useSetting, useSettings, useVfs, useWorkArea } from '@lumen/kernel/react';
import { AnchoredMenu, cx, type MenuEntry, useDialogs } from '@lumen/ui';
import { basename, type DirEntry, dirname, isValidName, join } from '@lumen/vfs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type IconBox, marqueeRect, type Point, sameSelection, touchesBox } from './marquee';

const ICON_SIZES = { small: 56, medium: 72, large: 96 } as const;

/** Manhattan distance a press has to travel before it counts as a drag, in px. */
const DRAG_THRESHOLD = 4;

/** Where every icon sits inside the icon layer, measured once per drag. */
function iconBoxes(root: HTMLElement): IconBox[] {
  const origin = root.getBoundingClientRect();
  const boxes: IconBox[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-desktop-path]')) {
    const path = el.dataset.desktopPath;
    if (!path) continue;
    const rect = el.getBoundingClientRect();
    boxes.push({
      path,
      box: {
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      },
    });
  }
  return boxes;
}

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
  const marqueeRef = useRef<HTMLDivElement>(null);
  /** Ends a rectangle drag that is still running and puts the selection back. */
  const abortMarquee = useRef<(() => void) | null>(null);

  useEffect(() => () => abortMarquee.current?.(), []);

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

  /**
   * A press on empty desktop draws the selection rectangle. The rectangle is
   * written straight to the element inside a frame, so only a change of
   * selection reaches React; a press that never travels far enough stays a
   * click and just clears the selection.
   */
  const startMarquee = (e: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    // Shift and Meta/Ctrl add to what is already selected; a plain press replaces it.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const before = selected;
    const base = additive ? selected : new Set<string>();
    if (!additive) setSelected(base);
    if (e.button !== 0) return;

    const origin = root.getBoundingClientRect();
    const boxes = iconBoxes(root);
    const pointerId = e.pointerId;
    const from: Point = { x: e.clientX - origin.left, y: e.clientY - origin.top };
    let to = from;
    let applied: ReadonlySet<string> = base;
    let moved = false;
    let raf = 0;

    const draw = () => {
      raf = 0;
      const rect = marqueeRect(from, to);
      const el = marqueeRef.current;
      if (el) {
        el.hidden = false;
        el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
      }
      const next = new Set(base);
      for (const icon of boxes) if (touchesBox(rect, icon.box)) next.add(icon.path);
      if (sameSelection(next, applied)) return;
      applied = next;
      setSelected(next);
    };

    const onMove = (ev: PointerEvent) => {
      to = { x: ev.clientX - origin.left, y: ev.clientY - origin.top };
      if (!moved && Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < DRAG_THRESHOLD) return;
      moved = true;
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKeyDown);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
      const el = marqueeRef.current;
      if (el) el.hidden = true;
      abortMarquee.current = null;
    };

    const cancel = () => {
      stop();
      setSelected(before);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      cancel();
    };

    // Captured so the release still arrives when the pointer leaves the window.
    root.setPointerCapture(pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKeyDown);
    abortMarquee.current = cancel;
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
      role="listbox"
      aria-label="Desktop"
      aria-multiselectable="true"
      tabIndex={-1}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) startMarquee(e);
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
            role="option"
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
                // biome-ignore lint/a11y/noAutofocus: the field replaces the name the user just chose to rename
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
      {/* Geometry is written to this element during the drag, never through state. */}
      <div
        ref={marqueeRef}
        hidden
        aria-hidden
        data-testid="desktop-marquee"
        className="pointer-events-none absolute top-0 left-0 border border-accent bg-selection"
      />
      <AnchoredMenu
        open={menu !== null}
        onClose={() => setMenu(null)}
        at={menu?.at ?? null}
        items={menu?.entry ? itemMenu(menu.entry) : backgroundMenu}
      />
    </div>
  );
}

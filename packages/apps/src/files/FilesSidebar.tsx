import { APPLICATIONS_DIR, HOME_SUBDIRS, TRASH_DIR } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { AnchoredMenu, cx, type MenuEntry, Sidebar, type SidebarSection, useContextMenu } from '@lumen/ui';
import { basename, join } from '@lumen/vfs';
import {
  AppWindow,
  Briefcase,
  Download,
  FileText,
  Folder,
  HardDrive,
  House,
  Image,
  type LucideIcon,
  Monitor,
  Music,
  Trash2,
  Video,
} from 'lucide-react';
import { type DragEvent, useMemo, useState } from 'react';
import { draggedPaths, hasPayload } from './dnd';

const SUBDIR_ICONS: Record<(typeof HOME_SUBDIRS)[number], LucideIcon> = {
  Desktop: Monitor,
  Documents: FileText,
  Downloads: Download,
  Pictures: Image,
  Music: Music,
  Videos: Video,
  Projects: Briefcase,
};

export interface Place {
  label: string;
  path: string;
}

/** The standard home folders, in sidebar order. */
export function standardPlaces(home: string): Place[] {
  return [{ label: 'Home', path: home }, ...HOME_SUBDIRS.map((name) => ({ label: name, path: join(home, name) }))];
}

export interface FilesSidebarProps {
  path: string;
  home: string;
  /** Standard places that exist on disk. */
  existing: ReadonlySet<string>;
  favorites: readonly string[];
  dropTarget: string | null;
  onNavigate: (path: string) => void;
  onOpenNewWindow: (path: string) => void;
  onRemoveFavorite: (path: string) => void;
  onAddFavorites: (paths: string[]) => void;
  onDragOverFolder: (path: string, e: DragEvent) => void;
  onDropFolder: (path: string, e: DragEvent) => void;
  onDragLeave: () => void;
}

export function FilesSidebar({
  path,
  home,
  existing,
  favorites,
  dropTarget,
  onNavigate,
  onOpenNewWindow,
  onRemoveFavorite,
  onAddFavorites,
  onDragOverFolder,
  onDropFolder,
  onDragLeave,
}: FilesSidebarProps) {
  const kernel = useKernel();
  const menu = useContextMenu();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [sectionDrop, setSectionDrop] = useState(false);

  const sections = useMemo<SidebarSection[]>(() => {
    const item = (p: string, label: string, Icon: LucideIcon) => ({
      id: p,
      label,
      icon: <Icon />,
      onSelect: () => onNavigate(p),
      onContextMenu: (e: React.MouseEvent) => {
        setMenuPath(p);
        menu.openAt(e);
      },
      onDragOver: (e: DragEvent) => onDragOverFolder(p, e),
      onDrop: (e: DragEvent) => onDropFolder(p, e),
    });
    const standard = standardPlaces(home)
      .filter((p) => existing.has(p.path))
      .map((p) => item(p.path, p.label, p.path === home ? House : (SUBDIR_ICONS[basename(p.path) as keyof typeof SUBDIR_ICONS] ?? Folder)));
    const user = favorites.map((p) => item(p, kernel.labelFor(p), Folder));
    return [
      { id: 'favorites', title: 'Favourites', items: [...standard, ...user] },
      {
        id: 'locations',
        title: 'Locations',
        items: [
          item('/', 'This Computer', HardDrive),
          item(APPLICATIONS_DIR, 'Applications', AppWindow),
          item(TRASH_DIR, 'Trash', Trash2),
        ],
      },
    ];
  }, [home, existing, favorites, kernel, menu.openAt, onNavigate, onDragOverFolder, onDropFolder]);

  const ids = useMemo(() => new Set(sections.flatMap((s) => s.items.map((i) => i.id))), [sections]);
  const activeId = dropTarget !== null && ids.has(dropTarget) ? dropTarget : path;

  const menuItems: MenuEntry[] = menuPath
    ? [
        { id: 'open', label: 'Open', onSelect: () => onNavigate(menuPath) },
        { id: 'open-window', label: 'Open in New Window', onSelect: () => onOpenNewWindow(menuPath) },
        ...(favorites.includes(menuPath)
          ? [
              { type: 'separator' } as MenuEntry,
              { id: 'remove', label: 'Remove from Favourites', onSelect: () => onRemoveFavorite(menuPath) },
            ]
          : []),
      ]
    : [];

  const overSection = (e: DragEvent) => !(e.target as HTMLElement).closest('button') && hasPayload(e);

  return (
    <div
      className={cx('h-full', sectionDrop && 'outline-2 -outline-offset-2 outline-accent')}
      onDragOver={(e) => {
        if (!overSection(e)) {
          setSectionDrop(false);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'link';
        setSectionDrop(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setSectionDrop(false);
        onDragLeave();
      }}
      onDrop={(e) => {
        setSectionDrop(false);
        if (!overSection(e)) return;
        e.preventDefault();
        onAddFavorites(draggedPaths(e));
      }}
    >
      <Sidebar sections={sections} activeId={activeId} width={200} className="h-full" />
      <AnchoredMenu open={menu.open} at={menu.at} onClose={menu.close} items={menuItems} />
    </div>
  );
}

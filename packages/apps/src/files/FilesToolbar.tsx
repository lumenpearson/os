import {
  AnchoredMenu,
  Breadcrumb,
  Button,
  IconButton,
  SearchField,
  SegmentedControl,
  Toolbar,
  ToolbarGroup,
} from '@lumen/ui';
import {
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FolderPlus,
  HardDrive,
  House,
  LayoutGrid,
  List,
  PanelLeft,
  Trash2,
} from 'lucide-react';
import { type DragEvent, useMemo, useRef, useState } from 'react';
import { type Crumb, collapseCrumbs, crumbsFor, type SortState, type ViewMode } from './logic';
import type { FilesActions } from './menus';
import { sortSubmenu } from './menus';

export interface FilesToolbarProps {
  path: string;
  home: string;
  canBack: boolean;
  canForward: boolean;
  view: ViewMode;
  sort: SortState;
  query: string;
  onQueryChange: (q: string) => void;
  inTrash: boolean;
  sidebarVisible: boolean;
  /**
   * Below this the toolbar drops the view switcher and the sidebar toggle,
   * shortens the search field and collapses the breadcrumb harder.
   */
  narrow: boolean;
  actions: FilesActions;
  onDragOverFolder: (path: string, e: DragEvent) => void;
  onDropFolder: (path: string, e: DragEvent) => void;
}

const VIEW_OPTIONS = [
  { value: 'list', icon: <List />, title: 'List' },
  { value: 'grid', icon: <LayoutGrid />, title: 'Grid' },
  { value: 'columns', icon: <Columns3 />, title: 'Columns' },
] as const;

const HIGHLIGHT = ['bg-selection', 'text-ink'];

/**
 * Navigation, the breadcrumb, view and sort controls, New Folder and search.
 * The first 72px stay empty: the window's traffic lights float there.
 */
export function FilesToolbar({
  path,
  home,
  canBack,
  canForward,
  view,
  sort,
  query,
  onQueryChange,
  inTrash,
  sidebarVisible,
  narrow,
  actions,
  onDragOverFolder,
  onDropFolder,
}: FilesToolbarProps) {
  const [sortAnchor, setSortAnchor] = useState<HTMLButtonElement | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const highlighted = useRef<HTMLButtonElement | null>(null);

  const crumbs = useMemo(
    () => collapseCrumbs(crumbsFor(path, home), narrow ? 3 : 5),
    [path, home, narrow],
  );
  const items = crumbs.map((c, i) => ({
    label: c ? c.label : '…',
    icon:
      i === 0 && c ? (
        c.path === '/' ? (
          <HardDrive className="size-3.5" />
        ) : (
          <House className="size-3.5" />
        )
      ) : undefined,
    onSelect: c ? () => actions.go(c.path) : undefined,
  }));

  const crumbAt = (e: DragEvent): Crumb | null => {
    const button = (e.target as HTMLElement).closest('button');
    const nav = e.currentTarget.querySelector('nav');
    if (!button || !nav) return null;
    const index = Array.from(nav.querySelectorAll('button')).indexOf(button);
    const crumb = crumbs[index];
    return crumb && crumb.path !== path ? crumb : null;
  };
  const highlight = (button: HTMLButtonElement | null) => {
    if (highlighted.current === button) return;
    highlighted.current?.classList.remove(...HIGHLIGHT);
    button?.classList.add(...HIGHLIGHT);
    highlighted.current = button;
  };

  return (
    <Toolbar className="pl-0">
      <div className="w-18 shrink-0" aria-hidden />
      <ToolbarGroup>
        <IconButton label="Back" disabled={!canBack} onClick={actions.back}>
          <ChevronLeft />
        </IconButton>
        <IconButton label="Forward" disabled={!canForward} onClick={actions.forward}>
          <ChevronRight />
        </IconButton>
        <IconButton label="Enclosing folder" disabled={path === '/'} onClick={actions.up}>
          <ArrowUp />
        </IconButton>
      </ToolbarGroup>
      <div
        className="mx-1 min-w-24 flex-1"
        onDragOver={(e) => {
          const crumb = crumbAt(e);
          highlight(
            crumb ? ((e.target as HTMLElement).closest('button') as HTMLButtonElement) : null,
          );
          if (crumb) onDragOverFolder(crumb.path, e);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) highlight(null);
        }}
        onDrop={(e) => {
          const crumb = crumbAt(e);
          highlight(null);
          if (crumb) onDropFolder(crumb.path, e);
        }}
      >
        <Breadcrumb items={items} />
      </div>
      {inTrash && (
        <Button size="sm" icon={<Trash2 className="size-3.5" />} onClick={actions.emptyTrash}>
          Empty Trash…
        </Button>
      )}
      <ToolbarGroup className="gap-1">
        {/* The three views stay on View > as List/Grid/Columns and Mod+1/2/3. */}
        {!narrow && (
          <SegmentedControl
            aria-label="View"
            size="sm"
            options={VIEW_OPTIONS}
            value={view}
            onChange={actions.setView}
          />
        )}
        <IconButton
          ref={setSortAnchor}
          label="Sort"
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          active={sortOpen}
          onClick={() => setSortOpen((o) => !o)}
        >
          <ArrowUpDown />
        </IconButton>
        <AnchoredMenu
          open={sortOpen}
          anchor={sortAnchor}
          align="end"
          onClose={() => setSortOpen(false)}
          items={sortSubmenu(sort, actions)}
        />
        <IconButton label="New folder" disabled={inTrash} onClick={actions.newFolder}>
          <FolderPlus />
        </IconButton>
        {!narrow && (
          <IconButton
            label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            active={!sidebarVisible}
            onClick={actions.toggleSidebar}
          >
            <PanelLeft />
          </IconButton>
        )}
      </ToolbarGroup>
      <SearchField
        value={query}
        onChange={onQueryChange}
        placeholder="Search"
        aria-label="Search this folder"
        className={narrow ? 'w-28' : 'w-44'}
        onKeyDown={(e) => {
          // Keep typing keys (including Mod+A/C/V) native inside the field.
          e.stopPropagation();
          if (e.key === 'Escape') {
            onQueryChange('');
            e.currentTarget.blur();
          }
        }}
      />
    </Toolbar>
  );
}

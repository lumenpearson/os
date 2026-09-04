import { AnchoredMenu, cx, IconButton, type MenuEntry, Toolbar, ToolbarGroup } from '@lumen/ui';
import { ArrowLeft, ArrowRight, House, MoreHorizontal, RotateCw, Star, X } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { AddressBar } from './AddressBar';
import type { Bookmark } from './data';
import type { Visit } from './history';
import type { TabStatus } from './tabs';
import type { SearchEngine } from './url';

export interface NavigationBarProps {
  url: string;
  status: TabStatus;
  engine: SearchEngine;
  bookmarks: readonly Bookmark[];
  history: readonly Visit[];
  canBack: boolean;
  canForward: boolean;
  bookmarked: boolean;
  /** Internal pages are furniture, not places worth keeping. */
  canBookmark: boolean;
  /** The commands that have no room in the toolbar. */
  menuItems: MenuEntry[];
  addressRef: RefObject<HTMLInputElement | null>;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onHome: () => void;
  onToggleBookmark: () => void;
}

/** Back, forward, reload, home; the address bar; the star; the rest behind a menu. */
export function NavigationBar({
  url,
  status,
  engine,
  bookmarks,
  history,
  canBack,
  canForward,
  bookmarked,
  canBookmark,
  menuItems,
  addressRef,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
  onHome,
  onToggleBookmark,
}: NavigationBarProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const loading = status === 'loading';

  return (
    <Toolbar dense className="gap-1.5">
      <ToolbarGroup>
        <IconButton label="Back" size="sm" disabled={!canBack} onClick={onBack}>
          <ArrowLeft />
        </IconButton>
        <IconButton label="Forward" size="sm" disabled={!canForward} onClick={onForward}>
          <ArrowRight />
        </IconButton>
        {loading ? (
          <IconButton label="Stop" size="sm" onClick={onStop}>
            <X />
          </IconButton>
        ) : (
          <IconButton label="Reload" size="sm" onClick={onReload}>
            <RotateCw />
          </IconButton>
        )}
        <IconButton label="Home" size="sm" onClick={onHome}>
          <House />
        </IconButton>
      </ToolbarGroup>
      <AddressBar
        url={url}
        status={status}
        engine={engine}
        bookmarks={bookmarks}
        history={history}
        onNavigate={onNavigate}
        inputRef={addressRef}
      />
      <ToolbarGroup>
        <IconButton
          label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
          size="sm"
          disabled={!canBookmark}
          active={bookmarked}
          onClick={onToggleBookmark}
        >
          <Star className={cx(bookmarked && 'fill-current text-accent')} />
        </IconButton>
        <IconButton
          ref={setMenuAnchor}
          label="Browser menu"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          active={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal />
        </IconButton>
        <AnchoredMenu
          open={menuOpen}
          anchor={menuAnchor}
          align="end"
          items={menuItems}
          onClose={() => setMenuOpen(false)}
        />
      </ToolbarGroup>
    </Toolbar>
  );
}

import {
  cx,
  IconButton,
  SearchField,
  SegmentedControl,
  Select,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
} from '@lumen/ui';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Info, PanelLeft } from 'lucide-react';
import type { RefObject } from 'react';
import { THUMB_SIZES, type ThumbSize } from './grid';
import type { PhotosLayout } from './layout';
import { type Album, albumLabel, type Scope, SORT_KEYS, type SortKey, scopeId } from './library';

export interface PhotosToolbarProps {
  layout: PhotosLayout;
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  scope: Scope;
  albums: readonly Album[];
  favouriteCount: number;
  onScopeChange: (id: string) => void;
  sort: SortKey;
  ascending: boolean;
  size: ThumbSize;
  sidebar: boolean;
  info: boolean;
  onSortChange: (key: SortKey) => void;
  onAscendingChange: (ascending: boolean) => void;
  onSizeChange: (size: ThumbSize) => void;
  onToggleSidebar: () => void;
  onToggleInfo: () => void;
}

/**
 * The controls that earn a place at the top of the window. Everything that
 * drops out of a narrow window is still in the menubar, so nothing becomes
 * unreachable — it only stops being one click away.
 */
export function PhotosToolbar({
  layout,
  query,
  onQueryChange,
  searchRef,
  scope,
  albums,
  favouriteCount,
  onScopeChange,
  sort,
  ascending,
  size,
  sidebar,
  info,
  onSortChange,
  onAscendingChange,
  onSizeChange,
  onToggleSidebar,
  onToggleInfo,
}: PhotosToolbarProps) {
  return (
    <Toolbar dense windowControls className="gap-2">
      <SearchField
        ref={searchRef}
        value={query}
        onChange={onQueryChange}
        placeholder="Search names"
        aria-label="Search picture names"
        className={cx('min-w-0 flex-1', layout.sortControls && 'max-w-64')}
      />

      {layout.albumPicker && (
        <Select
          aria-label="Album"
          value={scopeId(scope)}
          onChange={onScopeChange}
          size="sm"
          className="max-w-40"
          options={[
            { value: 'all', label: 'All Pictures' },
            { value: 'favourites', label: `Favourites (${favouriteCount})` },
            ...albums.map((album) => ({
              value: scopeId({ kind: 'album' as const, album: album.id }),
              label: `${albumLabel(album.id)} (${album.count})`,
            })),
          ]}
        />
      )}

      <ToolbarSpacer />

      {layout.sortControls && (
        <ToolbarGroup className="gap-1">
          <Select
            aria-label="Sort by"
            value={sort}
            onChange={onSortChange}
            size="sm"
            options={SORT_KEYS.map((key) => ({ value: key.id, label: key.label }))}
          />
          <IconButton
            label={ascending ? 'Sort Descending' : 'Sort Ascending'}
            size="sm"
            onClick={() => onAscendingChange(!ascending)}
          >
            {ascending ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
          </IconButton>
        </ToolbarGroup>
      )}

      {layout.sizeControl && (
        <SegmentedControl
          aria-label="Thumbnail size"
          size="sm"
          value={size}
          onChange={onSizeChange}
          options={THUMB_SIZES.map((entry) => ({ value: entry.id, label: entry.label }))}
        />
      )}

      {layout.panelToggles && (
        <ToolbarGroup>
          <IconButton label="Show Albums" size="sm" active={sidebar} onClick={onToggleSidebar}>
            <PanelLeft />
          </IconButton>
          <IconButton label="Show Info" size="sm" active={info} onClick={onToggleInfo}>
            <Info />
          </IconButton>
        </ToolbarGroup>
      )}
    </Toolbar>
  );
}

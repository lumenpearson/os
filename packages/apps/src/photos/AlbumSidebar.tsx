import { Sidebar } from '@lumen/ui';
import { Folder, Heart, Images } from 'lucide-react';
import { type Album, albumLabel, type Scope, scopeId } from './library';

export interface AlbumSidebarProps {
  albums: readonly Album[];
  total: number;
  favouriteCount: number;
  scope: Scope;
  onScopeChange: (id: string) => void;
}

/**
 * The albums are the folders under Pictures — there is nothing else on disk
 * to make an album out of, so there is nothing else here. A folder appears
 * once it holds a picture, and a nested one keeps its path so two folders
 * called "2024" stay apart.
 */
export function AlbumSidebar({
  albums,
  total,
  favouriteCount,
  scope,
  onScopeChange,
}: AlbumSidebarProps) {
  return (
    <Sidebar
      width={180}
      activeId={scopeId(scope)}
      sections={[
        {
          id: 'library',
          items: [
            {
              id: 'all',
              label: 'All Pictures',
              icon: <Images />,
              meta: String(total),
              onSelect: () => onScopeChange('all'),
            },
            {
              id: 'favourites',
              label: 'Favourites',
              icon: <Heart />,
              meta: String(favouriteCount),
              onSelect: () => onScopeChange('favourites'),
            },
          ],
        },
        {
          id: 'albums',
          title: albums.length > 0 ? 'Folders' : undefined,
          items: albums.map((album) => ({
            id: scopeId({ kind: 'album', album: album.id }),
            label: albumLabel(album.id),
            icon: <Folder />,
            meta: String(album.count),
            onSelect: () => onScopeChange(scopeId({ kind: 'album', album: album.id })),
          })),
        },
      ]}
    />
  );
}

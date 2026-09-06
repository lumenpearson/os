/**
 * Photos: the pictures already on the system, as a library.
 *
 * There is no database and no import step. One walk of the user's Pictures
 * folder is the library, the folders inside it are the albums, and the only
 * thing the app stores of its own is the favourites a person marks and how
 * they like the grid arranged. Everything shown about a picture is either
 * read from the file system or measured from the decoded image; nothing is
 * inferred, and nothing is invented.
 */
import { useApp as useAppDefinition, useKernel, useVfs } from '@lumen/kernel/react';
import {
  AnchoredMenu,
  AppFrame,
  Button,
  EmptyState,
  Spinner,
  ToolbarSpacer,
  useContextMenu,
  useDialogs,
  useElementSize,
} from '@lumen/ui';
import { join, VfsError } from '@lumen/vfs';
import { FolderOpen, ImageOff, RefreshCw, SearchX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useJsonFile,
  useLauncher,
  useNotify,
  useShortcut,
  useTitle,
  useWindowControls,
} from '../_sdk';
import type { Size } from '../preview/zoom';
import { AlbumSidebar } from './AlbumSidebar';
import type { ThumbSize } from './grid';
import { InfoPanel } from './InfoPanel';
import { Lightbox } from './Lightbox';
import { layoutFor } from './layout';
import {
  ALL_SCOPE,
  albumsOf,
  canEditWith,
  countLabel,
  cursorAfterChange,
  type Photo,
  parseScopeId,
  type SortKey,
  selectPhotos,
  stepIndex,
} from './library';
import {
  buildPhotosMenus,
  type PhotosActions,
  type PhotosMenuState,
  pictureContextMenu,
} from './menus';
import { PhotoGrid } from './PhotoGrid';
import { PhotosToolbar } from './PhotosToolbar';
import {
  DEFAULT_DATA,
  normalizeData,
  type PhotosData,
  type PhotosPrefs,
  toggleFavourite,
  withoutFavourites,
} from './settings';
import { useLibrary } from './useLibrary';

/** Wide enough for the lightbox's zoom reading and its facts panel. */
const LIGHTBOX_WIDE = 560;

export default function Photos(_props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const dialogs = useDialogs();
  const notify = useNotify();
  const { launch } = useLauncher();
  const { close, setDocument } = useWindowControls();
  const paint = useAppDefinition('lumen.paint');

  const root = join(kernel.home, 'Pictures');
  const { photos, loading, missing, error, refresh } = useLibrary(root);
  const [stored, store] = useJsonFile<PhotosData>(
    join(kernel.home, '.config', 'photos.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const { prefs } = data;
  const favourites = useMemo(() => new Set(data.favourites), [data.favourites]);

  const [frame, frameSize] = useElementSize<HTMLDivElement>();
  const [scope, setScope] = useState(ALL_SCOPE);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [dimensions, setDimensions] = useState<Size | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menu = useContextMenu();

  const albums = useMemo(() => albumsOf(photos), [photos]);
  const visible = useMemo(
    () =>
      selectPhotos(photos, {
        scope,
        query,
        favourites,
        sort: prefs.sort,
        order: prefs.order,
      }),
    [photos, scope, query, favourites, prefs.sort, prefs.order],
  );

  const index = cursor === null ? -1 : visible.findIndex((photo) => photo.path === cursor);
  const current: Photo | null = index >= 0 ? (visible[index] ?? null) : null;
  const layout = layoutFor(frameSize.width, prefs);
  const wide = frameSize.width === 0 || frameSize.width >= LIGHTBOX_WIDE;

  // The cursor follows the list when the list changes under it: a picture
  // moved to the Trash, a search narrowed, an album chosen. The position it
  // held before the change is what decides where it lands, so it is kept in
  // a ref and written after the effect below has read it.
  const lastIndex = useRef(0);
  useEffect(() => {
    const next = cursorAfterChange(cursor, lastIndex.current, visible);
    if (next !== cursor) setCursor(next);
    if (next === null) setLightbox(false);
  }, [visible, cursor]);
  useEffect(() => {
    if (index >= 0) lastIndex.current = index;
  }, [index]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new picture is the reason to forget the last one's pixels
  useEffect(() => setDimensions(null), [cursor]);

  useTitle(lightbox && current ? current.name : 'Photos');
  useEffect(() => {
    setDocument(current?.path ?? null);
  }, [current, setDocument]);

  // ── writing the preferences ─────────────────────────────────────────────

  const setPrefs = useCallback(
    (patch: Partial<PhotosPrefs>) => {
      store((previous) => {
        const current = normalizeData(previous);
        return { ...current, prefs: { ...current.prefs, ...patch } };
      });
    },
    [store],
  );

  const markFavourite = useCallback(
    (path: string) => {
      store((previous) => {
        const current = normalizeData(previous);
        return { ...current, favourites: toggleFavourite(current.favourites, path) };
      });
    },
    [store],
  );

  // ── commands ────────────────────────────────────────────────────────────

  const step = useCallback(
    (delta: number) => {
      const next = stepIndex(index, visible.length, delta);
      if (next === null) return;
      const photo = visible[next];
      if (photo) setCursor(photo.path);
    },
    [index, visible],
  );

  const trash = useCallback(async () => {
    if (!current) return;
    const ok = await dialogs.confirm({
      title: `Move ${current.name} to the Trash?`,
      confirmLabel: 'Move to Trash',
      danger: true,
    });
    if (!ok) return;
    try {
      await vfs.trash(current.path);
      store((previous) => {
        const data = normalizeData(previous);
        return { ...data, favourites: withoutFavourites(data.favourites, [current.path]) };
      });
      setLightbox(false);
      refresh();
    } catch (failure) {
      notify(
        'Could not move the picture to the Trash',
        VfsError.is(failure) ? failure.message : String(failure),
      );
    }
  }, [current, dialogs, vfs, store, notify, refresh]);

  const actions = useMemo<PhotosActions>(
    () => ({
      openInPreview: () => current && launch('lumen.preview', { path: current.path }),
      openInPaint: () => current && launch('lumen.paint', { path: current.path }),
      reveal: () => current && launch('lumen.files', { path: current.path }),
      trash: () => void trash(),
      refresh,
      close: () => void close(),
      toggleFavourite: () => current && markFavourite(current.path),
      previous: () => step(-1),
      next: () => step(1),
      openLightbox: () => current && setLightbox(true),
      closeLightbox: () => setLightbox(false),
      setSort: (sort: SortKey) => setPrefs({ sort }),
      setAscending: (ascending: boolean) =>
        setPrefs({ order: ascending ? 'ascending' : 'descending' }),
      setSize: (size: ThumbSize) => setPrefs({ size }),
      toggleInfo: () => setPrefs({ info: !prefs.info }),
      toggleSidebar: () => setPrefs({ sidebar: !prefs.sidebar }),
      focusSearch: () => searchRef.current?.focus(),
    }),
    [
      current,
      launch,
      trash,
      refresh,
      close,
      markFavourite,
      step,
      setPrefs,
      prefs.info,
      prefs.sidebar,
    ],
  );

  const menuState: PhotosMenuState = {
    hasSelection: current !== null,
    favourite: current !== null && favourites.has(current.path),
    canEdit: current !== null && canEditWith(paint, current.path),
    hasPrevious: stepIndex(index, visible.length, -1) !== null,
    hasNext: stepIndex(index, visible.length, 1) !== null,
    lightbox,
    sort: prefs.sort,
    ascending: prefs.order === 'ascending',
    size: prefs.size,
    info: prefs.info,
    sidebar: prefs.sidebar,
  };

  useAppMenus(buildPhotosMenus(menuState, actions), [
    actions,
    menuState.hasSelection,
    menuState.favourite,
    menuState.canEdit,
    menuState.hasPrevious,
    menuState.hasNext,
    menuState.lightbox,
    menuState.sort,
    menuState.ascending,
    menuState.size,
    menuState.info,
    menuState.sidebar,
  ]);

  useShortcut('Escape', () => setLightbox(false), lightbox);
  // Bare arrows walk the library only while a picture fills the window; in
  // the grid they move the cursor, and the grid handles them itself.
  useShortcut('Left', () => step(-1), lightbox);
  useShortcut('Right', () => step(1), lightbox);

  const openContextMenu = useCallback(
    (path: string, at: { x: number; y: number }) => {
      setCursor(path);
      menu.openAtPoint(at.x, at.y);
    },
    [menu],
  );

  // ── the library, or a plain account of why it is empty ──────────────────

  function body() {
    if (missing) {
      return (
        <EmptyState
          icon={<FolderOpen />}
          title="No Pictures folder"
          description={`This account has no folder at ${root}. Create it, put pictures in it, and they appear here.`}
          action={
            <Button icon={<RefreshCw />} onClick={refresh}>
              Look again
            </Button>
          }
        />
      );
    }
    if (error !== null) {
      return (
        <EmptyState
          icon={<ImageOff />}
          title="Could not read the Pictures folder"
          description={error}
          action={
            <Button icon={<RefreshCw />} onClick={refresh}>
              Try again
            </Button>
          }
        />
      );
    }
    if (loading && photos.length === 0) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner size={20} />
        </div>
      );
    }
    return (
      <PhotoGrid
        photos={visible}
        cursor={cursor}
        favourites={favourites}
        size={prefs.size}
        onCursorChange={setCursor}
        onOpen={(path) => {
          setCursor(path);
          setLightbox(true);
        }}
        onContextMenu={openContextMenu}
        empty={
          photos.length === 0 ? (
            <EmptyState
              icon={<ImageOff />}
              title="No pictures yet"
              description={`Pictures in ${root}, and in the folders inside it, appear here.`}
              action={
                <Button icon={<FolderOpen />} onClick={() => launch('lumen.files', { path: root })}>
                  Open Pictures in Files
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<SearchX />}
              title="Nothing here"
              description={
                query.trim()
                  ? `No picture name contains “${query.trim()}”.`
                  : 'This album has no pictures in it.'
              }
              action={
                query.trim() ? (
                  <Button
                    onClick={() => {
                      setQuery('');
                      searchRef.current?.focus();
                    }}
                  >
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
    );
  }

  if (lightbox && current) {
    return (
      <div ref={frame} className="flex h-full min-h-0 w-full flex-col">
        <Lightbox
          photo={current}
          index={index}
          total={visible.length}
          favourite={favourites.has(current.path)}
          info={prefs.info}
          wide={wide}
          onClose={() => setLightbox(false)}
          onStep={step}
          onToggleFavourite={() => markFavourite(current.path)}
          onToggleInfo={actions.toggleInfo}
          onDimensions={setDimensions}
        />
      </div>
    );
  }

  return (
    <div ref={frame} className="flex h-full min-h-0 w-full flex-col">
      <AppFrame
        toolbar={
          <PhotosToolbar
            layout={layout}
            query={query}
            onQueryChange={setQuery}
            searchRef={searchRef}
            scope={scope}
            albums={albums}
            favouriteCount={data.favourites.length}
            onScopeChange={(id) => setScope(parseScopeId(id))}
            sort={prefs.sort}
            ascending={prefs.order === 'ascending'}
            size={prefs.size}
            sidebar={prefs.sidebar}
            info={prefs.info}
            onSortChange={actions.setSort}
            onAscendingChange={actions.setAscending}
            onSizeChange={actions.setSize}
            onToggleSidebar={actions.toggleSidebar}
            onToggleInfo={actions.toggleInfo}
          />
        }
        sidebar={
          layout.sidebar ? (
            <AlbumSidebar
              albums={albums}
              total={photos.length}
              favouriteCount={data.favourites.length}
              scope={scope}
              onScopeChange={(id) => setScope(parseScopeId(id))}
            />
          ) : undefined
        }
        statusBar={
          <>
            <span className="shrink-0 tabular-nums">{countLabel(visible.length)}</span>
            {current && <span className="truncate-1 min-w-0 text-ink">{current.name}</span>}
            <ToolbarSpacer />
            <span className="shrink-0 tabular-nums">
              {countLabel(data.favourites.length, 'favourite')}
            </span>
          </>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{body()}</div>
          {layout.info && <InfoPanel photo={current} dimensions={dimensions} />}
        </div>
      </AppFrame>

      <AnchoredMenu
        open={menu.open}
        at={menu.at}
        onClose={menu.close}
        items={pictureContextMenu(menuState, actions)}
        onSelect={menu.close}
      />
    </div>
  );
}

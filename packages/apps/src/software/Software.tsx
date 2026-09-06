/**
 * Software Center: the store, what is installed, and installing from a file.
 *
 * A pseudo-program is a `.app` manifest — one JSON file under /Applications
 * that the kernel reads at boot and whenever the folder changes. Everything
 * here ends at that file: `Kernel.installApp` writes it, `Kernel.uninstallApp`
 * moves it to the Trash, `Kernel.launch` runs it. A package downloaded from a
 * store takes exactly the same road, through the same `planInstall`, once its
 * payload has been checked against the length and the digest its catalogue
 * promised — so a store install and a file install cannot end up different.
 *
 * The address of the store is one setting (Settings → Updates), the catalogue
 * is cached under the user's home, and the five programs that ship inside the
 * OS are folded into the same shelves, so the window has something to show
 * with no network at all.
 */

import type { AppManifest } from '@lumen/kernel';
import { useApps, useInstalledApps, useKernel, useSetting, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  IconButton,
  SearchField,
  Select,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useFilePicker,
  useLauncher,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { InstalledSection } from './InstalledSection';
import { InstallSection } from './InstallSection';
import { planInstall, planUninstall } from './install';
import {
  buildLibrary,
  categoryOptions,
  countBySource,
  filterEntries,
  findEntry,
  type LibraryEntry,
} from './library';
import { parseManifestText } from './manifest';
import { buildSoftwareMenus, SECTIONS, type SectionId } from './menus';
import { fetchPackage, type PackageDocument } from './remote';
import { resourceIds } from './resources';
import { COMPACT_AT, type StoreRoute, StoreSection } from './StoreSection';
import { StoreSidebar } from './StoreSidebar';
import {
  kindOptions,
  type Listing,
  listingStatus,
  mergeListings,
  categoryOptions as storeCategoryOptions,
} from './storefront';
import { type AvailableUpdate, availableUpdates } from './updates';
import { useCatalogue } from './useCatalogue';
import { useInstalls } from './useInstalls';

/** Below this the details pane takes the whole window instead of a column. */
const TWO_PANE_AT = 640;

/**
 * Names the store has been asked for by, and where each one lands now.
 *
 * A launch argument is written down — in a menu, a link, a terminal command —
 * and outlives the section it named. Catalogue became the Store, and the
 * Store became Discover; both still arrive somewhere sensible rather than on
 * the default with no explanation.
 */
const RENAMED: Record<string, SectionId> = {
  catalogue: 'discover',
  store: 'discover',
  library: 'installed',
};

function toSection(value: unknown): SectionId | null {
  if (SECTIONS.some((s) => s.id === value)) return value as SectionId;
  return typeof value === 'string' ? (RENAMED[value] ?? null) : null;
}

export default function Software(props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const registered = useApps({ includeHidden: true });
  const installed = useInstalledApps();
  const dialogs = useDialogs();
  const pick = useFilePicker();
  const notify = useNotify();
  const { launch } = useLauncher();
  const { close } = useWindowControls();
  const args = useArgs<{ section?: string }>(props.args);
  const [storeSettings] = useSetting('store');
  const [updateSettings] = useSetting('updates');
  useTitle('Software Center');

  const [section, setSection] = useState<SectionId>(() => toSection(args.section) ?? 'discover');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [storeKind, setStoreKind] = useState('all');
  const [storeCategory, setStoreCategory] = useState('all');
  const [route, setRoute] = useState<StoreRoute>({ kind: 'browse' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [origin, setOrigin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [bodyRef, size] = useElementSize<HTMLDivElement>();
  const wide = size.width === 0 || size.width >= TWO_PANE_AT;
  const compact = size.width > 0 && size.width < COMPACT_AT;

  useEffect(() => {
    const next = toSection(args.section);
    if (next) setSection(next);
  }, [args.section]);

  const { view, refresh } = useCatalogue();
  const storeBase = view.base ?? storeSettings.origin;
  const catalogue = useMemo(() => view.catalogue?.packages ?? [], [view.catalogue]);
  const installs = useInstalls({ base: storeBase, catalogue });

  const entries = useMemo(
    () =>
      buildLibrary(
        registered.filter((a) => !a.hidden),
        installed,
      ),
    [registered, installed],
  );
  const visible = useMemo(
    () => filterEntries(entries, { query, category }),
    [entries, query, category],
  );
  const categories = useMemo(() => categoryOptions(entries), [entries]);
  const counts = useMemo(() => countBySource(entries), [entries]);
  const selected = findEntry(visible, selectedId) ?? null;

  const listings = useMemo(() => mergeListings(view.catalogue), [view.catalogue]);
  const storeKinds = useMemo(() => kindOptions(listings), [listings]);
  const storeCategories = useMemo(() => storeCategoryOptions(listings), [listings]);
  const installedResourceIds = useMemo(() => resourceIds(installs.resources), [installs.resources]);
  const statusOf = useCallback(
    (listing: Listing) => listingStatus(listing, { entries, resourceIds: installedResourceIds }),
    [entries, installedResourceIds],
  );

  const builtInIds = useMemo(() => registered.map((a) => a.id), [registered]);
  const report = useMemo(
    () => parseManifestText(draft, { knownAppIds: builtInIds }),
    [draft, builtInIds],
  );
  const plan = useMemo(
    () => (report.manifest ? planInstall(report.manifest, { builtInIds, installed }) : null),
    [report.manifest, builtInIds, installed],
  );

  const open = useCallback((id: string) => launch(id), [launch]);

  const install = useCallback(
    async (manifest: AppManifest, options: { reveal?: boolean } = {}) => {
      const decision = planInstall(manifest, { builtInIds, installed });
      if (decision.action === 'blocked') {
        await dialogs.alert({
          title: `Cannot install ${manifest.name}`,
          message: decision.summary,
        });
        return;
      }
      setBusy(true);
      try {
        for (const path of decision.removePaths) await vfs.trash(path);
        await kernel.installApp(manifest);
        if (options.reveal) {
          setDraft('');
          setOrigin(null);
          setQuery('');
          setCategory('all');
          setSelectedId(manifest.id);
          setSection('installed');
        }
      } catch (e) {
        notify('Install failed', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [builtInIds, installed, dialogs, vfs, kernel, notify],
  );

  const remove = useCallback(
    async (entry: LibraryEntry) => {
      const decision = planUninstall(entry, kernel.home);
      if (!decision) return;
      const ok = await dialogs.confirm({
        title: decision.title,
        message: decision.message,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      await kernel.uninstallApp(entry.id);
      setSelectedId(null);
      notify(`${entry.name} removed`, `${decision.filePath} is in the Trash.`);
    },
    [kernel, dialogs, notify],
  );

  const chooseFile = useCallback(async () => {
    setSection('install');
    const picked = await pick({
      mode: 'open',
      title: 'Install from File',
      extensions: ['.app'],
      confirmLabel: 'Read Manifest',
    });
    const path = Array.isArray(picked) ? picked[0] : picked;
    if (!path) return;
    try {
      const text = await vfs.readText(path);
      setDraft(text);
      setOrigin(path);
    } catch (e) {
      notify('Could not read the file', e instanceof Error ? e.message : String(e));
    }
  }, [pick, vfs, notify]);

  const onDraft = useCallback((text: string, from: string | null) => {
    setDraft(text);
    setOrigin(from);
  }, []);

  const refreshStore = useCallback(() => {
    setSection('discover');
    refresh();
  }, [refresh]);

  const onQuery = useCallback((next: string) => {
    setQuery(next);
    // A search is about the shelves, so it takes the window back to them.
    setRoute((current) => (current.kind === 'browse' ? current : { kind: 'browse' }));
  }, []);

  const actions = useMemo(
    () => ({
      installFromFile: () => void chooseFile(),
      pasteManifest: () => {
        setSection('install');
        setTimeout(() => textRef.current?.focus(), 0);
      },
      refresh: refreshStore,
      find: () => searchRef.current?.focus(),
      show: (next: SectionId) => setSection(next),
      close: () => void close(),
    }),
    [chooseFile, close, refreshStore],
  );
  useAppMenus(buildSoftwareMenus({ section }, actions), [section, actions]);

  const startInstall = useCallback(
    (document: PackageDocument) => installs.start(document),
    [installs],
  );

  /**
   * An installed package the catalogue has moved past. Updating one is an
   * ordinary install of the newer version: `planInstall` already knows how to
   * replace a manifest whose id is on the system, so nothing here is a second
   * road into /Applications.
   */
  const updates = useMemo(() => availableUpdates(entries, catalogue), [entries, catalogue]);
  const updateOne = useCallback(
    async (update: AvailableUpdate) => {
      const result = await fetchPackage(storeBase, update.id);
      if (!result.ok) {
        notify(`Could not update ${update.name}`, result.error.message);
        return;
      }
      installs.start(result.value);
    },
    [storeBase, installs, notify],
  );
  const updateAll = useCallback(() => {
    for (const update of updates) void updateOne(update);
  }, [updates, updateOne]);

  /**
   * Settings > General > Automatic updates. Each version is started once per
   * session: without the guard the catalogue arriving again — or the library
   * changing as an install lands — would queue the same download repeatedly.
   */
  const started = useRef(new Set<string>());
  const updateRef = useLatest(updateOne);
  useEffect(() => {
    if (!updateSettings.automatic) return;
    for (const update of updates) {
      const key = `${update.id}@${update.to}`;
      if (started.current.has(key)) continue;
      started.current.add(key);
      void updateRef.current(update);
    }
  }, [updateSettings.automatic, updates, updateRef]);

  return (
    <AppFrame
      toolbar={
        <Toolbar dense>
          {/* The sections moved to the sidebar, which already says which one
              is open, so the toolbar is free to be about the section in view:
              what is searched, and by what. */}
          <ToolbarSpacer />
          {section !== 'install' && (
            <SearchField
              ref={searchRef}
              size="sm"
              className="min-w-16 max-w-52"
              placeholder={section === 'discover' ? 'Search the store' : 'Search apps'}
              aria-label={section === 'discover' ? 'Search the store' : 'Search apps'}
              value={query}
              onChange={onQuery}
            />
          )}
          {section === 'installed' && (
            <Select
              size="sm"
              aria-label="Category"
              options={categories}
              value={category}
              onChange={setCategory}
            />
          )}
          {section === 'discover' && !compact && (
            <>
              <Select
                size="sm"
                aria-label="Kind"
                options={storeKinds.map((k) => ({ value: k.value, label: k.label }))}
                value={storeKind}
                onChange={setStoreKind}
              />
              <Select
                size="sm"
                aria-label="Category"
                options={storeCategories.map((c) => ({ value: c.value, label: c.label }))}
                value={storeCategory}
                onChange={setStoreCategory}
              />
            </>
          )}
          {section === 'discover' && (
            <IconButton size="sm" label="Refresh catalogue" onClick={refresh}>
              <RefreshCw />
            </IconButton>
          )}
        </Toolbar>
      }
      statusBar={
        <>
          <span>{counts['built-in']} built-in</span>
          <span>{counts.installed} installed</span>
          {section === 'installed' && <span>{visible.length} shown</span>}
          {section === 'discover' && <span>{listings.length} in the catalogue</span>}
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <StoreSidebar
          section={section}
          onSection={setSection}
          installed={counts.installed}
          updates={updates.length}
        />
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col border-l border-rule">
          {section === 'discover' && (
            <StoreSection
              view={view}
              base={storeBase}
              listings={listings}
              filter={{ query, kind: storeKind, category: storeCategory }}
              statusOf={statusOf}
              jobs={installs.jobs}
              subscribe={installs.subscribe}
              compact={compact}
              kinds={storeKinds}
              categories={storeCategories}
              route={route}
              onRoute={setRoute}
              onKind={setStoreKind}
              onCategory={setStoreCategory}
              onRefresh={refresh}
              onStop={installs.stop}
              onDismiss={installs.dismiss}
              onInstall={startInstall}
              onInstallSystem={(manifest) => void install(manifest)}
              onOpenApp={open}
            />
          )}
          {section === 'installed' && (
            <InstalledSection
              entries={visible}
              selected={selected}
              wide={wide}
              updates={updates}
              automatic={updateSettings.automatic}
              onUpdateAll={updateAll}
              onSelect={setSelectedId}
              onOpen={(entry) => open(entry.id)}
              onRemove={(entry) => void remove(entry)}
            />
          )}
          {section === 'install' && (
            <InstallSection
              draft={draft}
              origin={origin}
              report={report}
              plan={plan}
              busy={busy}
              textRef={textRef}
              onDraft={onDraft}
              onChooseFile={() => void chooseFile()}
              onInstall={() => report.manifest && void install(report.manifest, { reveal: true })}
              onError={(message) => notify('Could not read that file', message)}
            />
          )}
        </div>
      </div>
    </AppFrame>
  );
}

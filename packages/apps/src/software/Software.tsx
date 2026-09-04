/**
 * Software Center: what is installed, how to install more, and what the OS
 * ships with.
 *
 * A pseudo-program is a `.app` manifest — one JSON file under /Applications
 * that the kernel reads at boot and whenever the folder changes. This window
 * is a front end for that: `Kernel.installApp` writes the file,
 * `Kernel.uninstallApp` moves it to the Trash, and `Kernel.launch` runs it,
 * through the built-in app it aliases, the Terminal, or the sandboxed frame
 * in `lumen.webapp`. Nothing here talks to a network.
 */

import type { AppManifest } from '@lumen/kernel';
import { useApps, useInstalledApps, useKernel, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  SearchField,
  SegmentedControl,
  Select,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useElementSize,
} from '@lumen/ui';
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
import { CatalogueSection } from './CatalogueSection';
import { searchCatalogue } from './catalogue';
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

/** Below this the details pane takes the whole window instead of a column. */
const TWO_PANE_AT = 640;

function isSection(value: unknown): value is SectionId {
  return SECTIONS.some((s) => s.id === value);
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
  useTitle('Software Center');

  const [section, setSection] = useState<SectionId>(() =>
    isSection(args.section) ? args.section : 'installed',
  );
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [origin, setOrigin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [bodyRef, size] = useElementSize<HTMLDivElement>();
  const wide = size.width === 0 || size.width >= TWO_PANE_AT;

  useEffect(() => {
    if (isSection(args.section)) setSection(args.section);
  }, [args.section]);

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
  const cards = useMemo(() => searchCatalogue(query), [query]);

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
    async (manifest: AppManifest) => {
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
        setDraft('');
        setOrigin(null);
        setQuery('');
        setCategory('all');
        setSelectedId(manifest.id);
        setSection('installed');
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

  const actions = useMemo(
    () => ({
      installFromFile: () => void chooseFile(),
      pasteManifest: () => {
        setSection('install');
        setTimeout(() => textRef.current?.focus(), 0);
      },
      find: () => searchRef.current?.focus(),
      show: (next: SectionId) => setSection(next),
      close: () => void close(),
    }),
    [chooseFile, close],
  );
  useAppMenus(buildSoftwareMenus({ section }, actions), [section, actions]);

  return (
    <AppFrame
      toolbar={
        <Toolbar dense>
          <SegmentedControl
            aria-label="Section"
            size="sm"
            options={SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
            value={section}
            onChange={setSection}
          />
          <ToolbarSpacer />
          {section !== 'install' && (
            <SearchField
              ref={searchRef}
              size="sm"
              className="max-w-52"
              placeholder="Search apps"
              aria-label="Search apps"
              value={query}
              onChange={setQuery}
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
        </Toolbar>
      }
      statusBar={
        <>
          <span>{counts['built-in']} built-in</span>
          <span>{counts.installed} installed</span>
          {section === 'installed' && <span>{visible.length} shown</span>}
        </>
      }
    >
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        {section === 'installed' && (
          <InstalledSection
            entries={visible}
            selected={selected}
            wide={wide}
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
            onInstall={() => report.manifest && void install(report.manifest)}
            onError={(message) => notify('Could not read that file', message)}
          />
        )}
        {section === 'catalogue' && (
          <CatalogueSection
            manifests={cards}
            entries={entries}
            busy={busy}
            onInstall={(manifest) => void install(manifest)}
            onOpen={(manifest) => open(manifest.id)}
          />
        )}
      </div>
    </AppFrame>
  );
}

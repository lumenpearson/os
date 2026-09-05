import type { MenuTemplate } from '@lumen/kernel';
import { useSettingsStore } from '@lumen/kernel';
import {
  EmptyState,
  SearchField,
  Select,
  type SelectOption,
  Sidebar,
  type SidebarSection,
  useElementSize,
} from '@lumen/ui';
import {
  Bell,
  Folder,
  Gauge,
  Globe,
  HardDrive,
  Image,
  Info,
  Keyboard,
  Lock,
  Monitor,
  MousePointer2,
  Palette,
  PanelBottom,
  Power,
  RotateCcw,
  SearchX,
  Shield,
  SlidersHorizontal,
  Volume2,
  Wifi,
} from 'lucide-react';
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useArgs,
  useLauncher,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { PAGES } from './pages';
import { SearchMatchProvider } from './Row';
import {
  isSectionId,
  SETTINGS_SECTIONS,
  type SectionId,
  SIDEBAR_GROUPS,
  searchSettings,
  sectionById,
} from './sections';

const ICONS: Record<SectionId, ComponentType<{ className?: string }>> = {
  general: SlidersHorizontal,
  appearance: Palette,
  animation: Gauge,
  wallpaper: Image,
  taskbar: PanelBottom,
  display: Monitor,
  security: Lock,
  notifications: Bell,
  sound: Volume2,
  network: Wifi,
  keyboard: Keyboard,
  cursor: MousePointer2,
  region: Globe,
  files: Folder,
  storage: HardDrive,
  privacy: Shield,
  power: Power,
  reset: RotateCcw,
  about: Info,
};

/** Below this window width the sidebar becomes a select above the page. */
const NARROW_WIDTH = 620;
const SIDEBAR_WIDTH = 220;

export default function Settings(props: AppProps) {
  const args = useArgs(props.args);
  const [section, setSection] = useState<SectionId>(() =>
    isSectionId(props.args.section) ? props.args.section : 'general',
  );
  const [query, setQuery] = useState('');
  const { close } = useWindowControls();
  const { launch } = useLauncher();
  const reduceMotion = useSettingsStore((s) => s.settings.appearance.reduceMotion);
  useTitle('Settings');

  // Singleton re-launch delivers a new `section`.
  useEffect(() => {
    if (isSectionId(args.section)) setSection(args.section);
  }, [args]);

  const results = useMemo(() => searchSettings(query), [query]);
  const visible = useMemo(() => new Set(results.map((r) => r.section.id)), [results]);
  const matches = useMemo<ReadonlySet<string>>(
    () => new Set(results.find((r) => r.section.id === section)?.rows ?? []),
    [results, section],
  );

  // Keep the shown page inside the filtered list.
  useEffect(() => {
    if (!query || results.length === 0 || visible.has(section)) return;
    const first = results[0];
    if (first) setSection(first.section.id);
  }, [query, results, visible, section]);

  // Bring the first matching row into view once the page has rendered.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matches.size === 0) return;
    const el = content.current?.querySelector<HTMLElement>('[data-match]');
    el?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [matches, reduceMotion]);

  useAppMenus(
    [
      {
        id: 'file',
        label: 'File',
        items: [{ id: 'close', label: 'Close', shortcut: 'Mod+W', onSelect: () => void close() }],
      },
      {
        id: 'view',
        label: 'View',
        items: SETTINGS_SECTIONS.map((s) => ({
          id: s.id,
          type: 'radio',
          label: s.label,
          checked: s.id === section,
          onSelect: () => {
            setQuery('');
            setSection(s.id);
          },
        })),
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          {
            id: 'help',
            label: 'Settings Help',
            onSelect: () => launch('lumen.help', { section: 'settings' }),
          },
        ],
      },
    ] satisfies MenuTemplate[],
    [section, close, launch],
  );

  const [rootRef, size] = useElementSize<HTMLDivElement>();
  const narrow = size.width > 0 && size.width < NARROW_WIDTH;

  const sidebarSections = useMemo<SidebarSection[]>(
    () =>
      SIDEBAR_GROUPS.map((ids, i) => ({
        id: `group-${i}`,
        items: ids
          .filter((id) => visible.has(id))
          .map((id) => {
            const s = sectionById(id);
            const Icon = ICONS[id];
            return { id, label: s.label, icon: <Icon />, onSelect: () => setSection(id) };
          }),
      })).filter((g) => g.items.length > 0),
    [visible],
  );

  const selectOptions = useMemo<SelectOption<SectionId>[]>(
    () =>
      SETTINGS_SECTIONS.filter((s) => visible.has(s.id)).map((s) => ({
        value: s.id,
        label: s.label,
      })),
    [visible],
  );

  const search = (
    <SearchField
      size="sm"
      placeholder="Search settings"
      aria-label="Search settings"
      value={query}
      onChange={setQuery}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && results[0]) setSection(results[0].section.id);
        if (e.key === 'Escape' && query) {
          e.preventDefault();
          setQuery('');
        }
      }}
    />
  );

  const Page = PAGES[section];
  const nothing = query.length > 0 && results.length === 0;

  return (
    <div ref={rootRef} className="flex h-full w-full flex-col bg-surface text-ink">
      {narrow && (
        <div className="flex shrink-0 items-center gap-2 border-b border-rule bg-canvas p-2">
          <div className="flex-1">{search}</div>
          {selectOptions.length > 0 && (
            <Select
              aria-label="Section"
              size="sm"
              options={selectOptions}
              value={section}
              onChange={setSection}
            />
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {!narrow && (
          <Sidebar
            width={SIDEBAR_WIDTH}
            activeId={section}
            sections={sidebarSections}
            header={<div className="px-2 pt-2 pb-1">{search}</div>}
            footer={
              nothing ? (
                <p className="px-4 pb-3 text-sm text-ink-2">No settings match “{query}”.</p>
              ) : undefined
            }
          />
        )}
        <div ref={content} className="min-h-0 min-w-0 flex-1">
          {narrow && nothing ? (
            <EmptyState
              icon={<SearchX />}
              title="No settings match"
              description={`Nothing is called “${query}”. Try another word.`}
            />
          ) : (
            <SearchMatchProvider matches={matches}>
              <Page />
            </SearchMatchProvider>
          )}
        </div>
      </div>
    </div>
  );
}

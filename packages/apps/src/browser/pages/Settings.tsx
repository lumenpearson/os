import {
  Button,
  IconButton,
  Input,
  Select,
  type SelectOption,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  Switch,
  useDialogs,
} from '@lumen/ui';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import {
  type BrowserSettings,
  CUSTOM_ENGINE_ID,
  DEFAULT_DOWNLOADS_DIR,
  displayPath,
  downloadsPath,
  FRAME_NOTE,
  FRAME_TIMEOUTS,
  isValidTemplate,
  type NewTabTarget,
  QUERY_TOKEN,
  templateFor,
  withHost,
  withoutHost,
} from '../settings';
import { formatZoom, ZOOM_LEVELS } from '../tabs';
import { hostPattern, SEARCH_ENGINES, START_URL } from '../url';

export interface BrowserSettingsPageProps {
  settings: BrowserSettings;
  /** The user's home folder, so paths can be shown with a `~`. */
  home: string;
  bookmarkCount: number;
  historyCount: number;
  onChange: (patch: Partial<BrowserSettings>) => void;
  onChooseDownloads: () => void;
  onExportBookmarks: () => void;
  onClearHistory: () => void;
  onClearBookmarks: () => void;
}

const ENGINE_OPTIONS: ReadonlyArray<SelectOption> = [
  ...SEARCH_ENGINES.map((e) => ({ value: e.id, label: e.name })),
  { value: CUSTOM_ENGINE_ID, label: 'Custom…' },
];

const NEW_TAB_OPTIONS: ReadonlyArray<SelectOption<NewTabTarget>> = [
  { value: 'start', label: 'New Tab page' },
  { value: 'homepage', label: 'Homepage' },
  { value: 'blank', label: 'Blank page' },
];

const ZOOM_OPTIONS: ReadonlyArray<SelectOption> = ZOOM_LEVELS.map((z) => ({
  value: String(z),
  label: formatZoom(z),
}));

const WAIT_OPTIONS: ReadonlyArray<SelectOption> = FRAME_TIMEOUTS.map((ms) => ({
  value: String(ms),
  label: `${ms / 1000} s`,
}));

/**
 * Everything the browser can actually be told to do differently. Each row
 * changes something the app reads: the frame's sandbox attribute, the address
 * a new tab opens, the query a search sends, how long a frame is given.
 */
export function BrowserSettingsPage({
  settings,
  home,
  bookmarkCount,
  historyCount,
  onChange,
  onChooseDownloads,
  onExportBookmarks,
  onClearHistory,
  onClearBookmarks,
}: BrowserSettingsPageProps) {
  const dialogs = useDialogs();
  const ids = {
    home: useId(),
    newTab: useId(),
    engine: useId(),
    template: useId(),
    zoom: useId(),
    bar: useId(),
    scripts: useId(),
    forms: useId(),
    popups: useId(),
    downloads: useId(),
    storage: useId(),
    wait: useId(),
    host: useId(),
    keepHistory: useId(),
  };

  const [homepage, setHomepage] = useState(settings.homepage);
  const [template, setTemplate] = useState(() => templateFor(settings));
  const [host, setHost] = useState('');

  // The file is the source of truth; a change made elsewhere wins over a draft.
  useEffect(() => setHomepage(settings.homepage), [settings.homepage]);
  useEffect(() => {
    setTemplate(templateFor(settings));
  }, [settings]);

  const custom = settings.searchEngine === CUSTOM_ENGINE_ID;
  const templateBroken = custom && template.trim() !== '' && !isValidTemplate(template);

  const commitHomepage = () => {
    const value = homepage.trim();
    if (!value) {
      setHomepage(settings.homepage);
      return;
    }
    if (value !== settings.homepage) onChange({ homepage: value });
  };

  const commitTemplate = () => {
    const value = template.trim();
    if (!custom || value === settings.searchTemplate) return;
    if (value !== '' && !isValidTemplate(value)) return;
    onChange({ searchTemplate: value });
  };

  const addHost = (e: FormEvent) => {
    e.preventDefault();
    const pattern = hostPattern(host);
    if (!pattern) return;
    setHost('');
    onChange({ externalHosts: withHost(settings.externalHosts, pattern) });
  };

  const clearHistory = async () => {
    const ok = await dialogs.confirm({
      title: 'Clear browsing history?',
      message: `${historyCount} ${historyCount === 1 ? 'page' : 'pages'} will be removed from this browser. Bookmarks are kept.`,
      confirmLabel: 'Clear History',
      danger: true,
    });
    if (ok) onClearHistory();
  };

  const clearBookmarks = async () => {
    const ok = await dialogs.confirm({
      title: 'Remove every bookmark?',
      message: `${bookmarkCount} ${bookmarkCount === 1 ? 'bookmark' : 'bookmarks'} will be removed. This cannot be undone.`,
      confirmLabel: 'Remove All',
      danger: true,
    });
    if (ok) onClearBookmarks();
  };

  return (
    <SettingsPage title="Browser Settings">
      <SettingsGroup title="Startup">
        <SettingsRow
          label="Homepage"
          description="Where the Home button goes."
          htmlFor={ids.home}
          stacked
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id={ids.home}
              mono
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={START_URL}
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
              onBlur={commitHomepage}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setHomepage(settings.homepage);
              }}
              className="flex-1"
            />
            <Button
              disabled={settings.homepage === START_URL}
              onClick={() => {
                setHomepage(START_URL);
                onChange({ homepage: START_URL });
              }}
            >
              Use New Tab Page
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          label="New tab opens"
          description="What Ctrl+T and the plus button open."
          htmlFor={ids.newTab}
        >
          <Select
            id={ids.newTab}
            options={NEW_TAB_OPTIONS}
            value={settings.newTab}
            onChange={(newTab) => onChange({ newTab })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Search">
        <SettingsRow
          label="Search engine"
          description="Where the address bar sends text that is not an address."
          htmlFor={ids.engine}
        >
          <Select
            id={ids.engine}
            options={ENGINE_OPTIONS}
            value={settings.searchEngine}
            onChange={(searchEngine) => onChange({ searchEngine })}
          />
        </SettingsRow>
        <SettingsRow
          label="Query template"
          description={`The query, percent-encoded, replaces ${QUERY_TOKEN}.`}
          htmlFor={ids.template}
          stacked
        >
          <Input
            id={ids.template}
            mono
            type="text"
            spellCheck={false}
            autoComplete="off"
            readOnly={!custom}
            aria-invalid={templateBroken || undefined}
            placeholder="https://example.com/search?q=%s"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            onBlur={commitTemplate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setTemplate(templateFor(settings));
            }}
            className="w-full"
          />
          {templateBroken && (
            <p className="text-sm text-ink-2">
              A template needs an http or https address and one {QUERY_TOKEN}. Until it has both,
              searches use {SEARCH_ENGINES[0]?.name}.
            </p>
          )}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <SettingsRow
          label="Default zoom"
          description="Where a new tab starts, and where Actual Size returns to."
          htmlFor={ids.zoom}
        >
          <Select
            id={ids.zoom}
            mono
            options={ZOOM_OPTIONS}
            value={String(settings.defaultZoom)}
            onChange={(value) => onChange({ defaultZoom: Number(value) })}
          />
        </SettingsRow>
        <SettingsRow
          label="Bookmarks bar"
          description="A row of starred pages under the toolbar."
          htmlFor={ids.bar}
        >
          <Switch
            id={ids.bar}
            checked={settings.showBookmarksBar}
            onChange={(e) => onChange({ showBookmarksBar: e.target.checked })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Page frame" description={FRAME_NOTE}>
        <SettingsRow
          label="JavaScript"
          description="allow-scripts. Off breaks most of the web, and is the safest way to read a page."
          htmlFor={ids.scripts}
        >
          <Switch
            id={ids.scripts}
            checked={settings.allowScripts}
            onChange={(e) => onChange({ allowScripts: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow label="Forms" description="allow-forms." htmlFor={ids.forms}>
          <Switch
            id={ids.forms}
            checked={settings.allowForms}
            onChange={(e) => onChange({ allowForms: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label="Pop-up windows"
          description="allow-popups. A page may open a window outside Lumen."
          htmlFor={ids.popups}
        >
          <Switch
            id={ids.popups}
            checked={settings.allowPopups}
            onChange={(e) => onChange({ allowPopups: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label="Downloads"
          description="allow-downloads. A page may start a download in the browser running Lumen."
          htmlFor={ids.downloads}
        >
          <Switch
            id={ids.downloads}
            checked={settings.allowDownloads}
            onChange={(e) => onChange({ allowDownloads: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label="Cookies and storage"
          description="allow-same-origin. Off puts the page in an origin of its own, where it can keep nothing."
          htmlFor={ids.storage}
        >
          <Switch
            id={ids.storage}
            checked={settings.allowStorage}
            onChange={(e) => onChange({ allowStorage: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label="Give up after"
          description="A frame that has said nothing by then is called blocked."
          htmlFor={ids.wait}
        >
          <Select
            id={ids.wait}
            mono
            options={WAIT_OPTIONS}
            value={String(settings.frameTimeoutMs)}
            onChange={(value) => onChange({ frameTimeoutMs: Number(value) })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Sites that open outside Lumen"
        description="These addresses are handed to the browser Lumen is running in instead of a frame. Subdomains are included."
      >
        <SettingsRow label="Add a site" htmlFor={ids.host} stacked>
          <form onSubmit={addHost} className="flex w-full items-center gap-2">
            <Input
              id={ids.host}
              mono
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="example.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" icon={<Plus />} disabled={hostPattern(host) === null}>
              Add
            </Button>
          </form>
        </SettingsRow>
        {settings.externalHosts.length === 0 ? (
          <SettingsRow
            label="No sites yet"
            description="Add one here, or use Always Open Outside on a page that refused to be embedded."
          />
        ) : (
          settings.externalHosts.map((pattern) => (
            <div key={pattern} className="flex items-center justify-between gap-4 px-4 py-2">
              <span className="mono truncate-1 text-base text-ink">{pattern}</span>
              <IconButton
                label={`Remove ${pattern}`}
                size="sm"
                onClick={() =>
                  onChange({ externalHosts: withoutHost(settings.externalHosts, pattern) })
                }
              >
                <X />
              </IconButton>
            </div>
          ))
        )}
      </SettingsGroup>

      <SettingsGroup title="Downloads">
        <SettingsRow
          label="Downloads folder"
          description={displayPath(downloadsPath(settings, home), home)}
        >
          <Button onClick={onChooseDownloads}>Choose…</Button>
          <Button
            disabled={settings.downloadsDir === DEFAULT_DOWNLOADS_DIR}
            onClick={() => onChange({ downloadsDir: DEFAULT_DOWNLOADS_DIR })}
          >
            Reset
          </Button>
        </SettingsRow>
        <SettingsRow label="Export bookmarks" description="Writes bookmarks.json into that folder.">
          <Button disabled={bookmarkCount === 0} onClick={onExportBookmarks}>
            Export
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Stored data"
        description="Everything this browser keeps lives in one file under your home folder."
      >
        <SettingsRow
          label="Keep history"
          description="Off stops new visits from being written down. What is already there stays."
          htmlFor={ids.keepHistory}
        >
          <Switch
            id={ids.keepHistory}
            checked={settings.keepHistory}
            onChange={(e) => onChange({ keepHistory: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label="Browsing history"
          description={
            historyCount === 0
              ? 'Nothing recorded.'
              : `${historyCount} ${historyCount === 1 ? 'page' : 'pages'} recorded.`
          }
        >
          <Button
            variant="danger"
            disabled={historyCount === 0}
            onClick={() => void clearHistory()}
          >
            Clear History
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Bookmarks"
          description={
            bookmarkCount === 0
              ? 'Nothing kept.'
              : `${bookmarkCount} ${bookmarkCount === 1 ? 'page' : 'pages'} kept.`
          }
        >
          <Button
            variant="danger"
            disabled={bookmarkCount === 0}
            onClick={() => void clearBookmarks()}
          >
            Remove All
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

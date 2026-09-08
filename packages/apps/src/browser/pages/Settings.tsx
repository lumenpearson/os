import type { Translate } from '@lumen/kernel';
import { useT } from '@lumen/kernel/react';
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

function engineOptions(t: Translate): ReadonlyArray<SelectOption> {
  return [
    ...SEARCH_ENGINES.map((engine) => ({ value: engine.id, label: engine.name })),
    { value: CUSTOM_ENGINE_ID, label: t('browserApp.custom') },
  ];
}

function newTabOptions(t: Translate): ReadonlyArray<SelectOption<NewTabTarget>> {
  return [
    { value: 'start', label: t('browserApp.newTabPage') },
    { value: 'homepage', label: t('browserApp.homepage') },
    { value: 'blank', label: t('browserApp.blankPage') },
  ];
}

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
  const t = useT();
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
      title: t('browserApp.clearHistoryTitle'),
      message: `${historyCount} ${historyCount === 1 ? 'page' : 'pages'} will be removed from this browser. Bookmarks are kept.`,
      confirmLabel: t('browserApp.clearHistory'),
      danger: true,
    });
    if (ok) onClearHistory();
  };

  const clearBookmarks = async () => {
    const ok = await dialogs.confirm({
      title: t('browserApp.removeAllTitle'),
      message: `${bookmarkCount} ${bookmarkCount === 1 ? 'bookmark' : 'bookmarks'} will be removed. This cannot be undone.`,
      confirmLabel: t('browserApp.removeAll'),
      danger: true,
    });
    if (ok) onClearBookmarks();
  };

  return (
    <SettingsPage title={t('browserApp.settings')}>
      <SettingsGroup title={t('browserApp.startup')}>
        <SettingsRow
          label={t('browserApp.homepage')}
          description={t('browserApp.homepageHint')}
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
              {t('browserApp.useNewTabPage')}
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.newTabOpens')}
          description={t('browserApp.newTabHint')}
          htmlFor={ids.newTab}
        >
          <Select
            id={ids.newTab}
            options={newTabOptions(t)}
            value={settings.newTab}
            onChange={(newTab) => onChange({ newTab })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('browserApp.search')}>
        <SettingsRow
          label={t('browserApp.searchEngine')}
          description={t('browserApp.searchEngineHint')}
          htmlFor={ids.engine}
        >
          <Select
            id={ids.engine}
            options={engineOptions(t)}
            value={settings.searchEngine}
            onChange={(searchEngine) => onChange({ searchEngine })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.queryTemplate')}
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
            placeholder={t('browserApp.queryPlaceholder')}
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
              {t('browserApp.templateBroken', {
                token: QUERY_TOKEN,
                engine: SEARCH_ENGINES[0]?.name ?? '',
              })}
            </p>
          )}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('browserApp.appearance')}>
        <SettingsRow
          label={t('browserApp.defaultZoom')}
          description={t('browserApp.defaultZoomHint')}
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
          label={t('browserApp.bookmarksBar')}
          description={t('browserApp.bookmarksBarHint')}
          htmlFor={ids.bar}
        >
          <Switch
            id={ids.bar}
            checked={settings.showBookmarksBar}
            onChange={(e) => onChange({ showBookmarksBar: e.target.checked })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('browserApp.pageFrame')} description={FRAME_NOTE}>
        <SettingsRow
          label={t('browserApp.javascript')}
          description={t('browserApp.javascriptHint')}
          htmlFor={ids.scripts}
        >
          <Switch
            id={ids.scripts}
            checked={settings.allowScripts}
            onChange={(e) => onChange({ allowScripts: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.forms')}
          description={t('browserApp.formsHint')}
          htmlFor={ids.forms}
        >
          <Switch
            id={ids.forms}
            checked={settings.allowForms}
            onChange={(e) => onChange({ allowForms: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.popups')}
          description={t('browserApp.popupsHint')}
          htmlFor={ids.popups}
        >
          <Switch
            id={ids.popups}
            checked={settings.allowPopups}
            onChange={(e) => onChange({ allowPopups: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.downloads')}
          description={t('browserApp.downloadsHint')}
          htmlFor={ids.downloads}
        >
          <Switch
            id={ids.downloads}
            checked={settings.allowDownloads}
            onChange={(e) => onChange({ allowDownloads: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.cookies')}
          description={t('browserApp.cookiesHint')}
          htmlFor={ids.storage}
        >
          <Switch
            id={ids.storage}
            checked={settings.allowStorage}
            onChange={(e) => onChange({ allowStorage: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.giveUpAfter')}
          description={t('browserApp.giveUpHint')}
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

      <SettingsGroup title={t('browserApp.outsideSites')} description={t('browserApp.outsideHint')}>
        <SettingsRow label={t('browserApp.addSite')} htmlFor={ids.host} stacked>
          <form onSubmit={addHost} className="flex w-full items-center gap-2">
            <Input
              id={ids.host}
              mono
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={t('browserApp.sitePlaceholder')}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" icon={<Plus />} disabled={hostPattern(host) === null}>
              {t('browserApp.add')}
            </Button>
          </form>
        </SettingsRow>
        {settings.externalHosts.length === 0 ? (
          <SettingsRow label={t('browserApp.noSites')} description={t('browserApp.noSitesHint')} />
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

      <SettingsGroup title={t('browserApp.downloads')}>
        <SettingsRow
          label={t('browserApp.downloadsFolder')}
          description={displayPath(downloadsPath(settings, home), home)}
        >
          <Button onClick={onChooseDownloads}>{t('browserApp.choose')}</Button>
          <Button
            disabled={settings.downloadsDir === DEFAULT_DOWNLOADS_DIR}
            onClick={() => onChange({ downloadsDir: DEFAULT_DOWNLOADS_DIR })}
          >
            {t('browserApp.reset')}
          </Button>
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.exportBookmarks')}
          description={t('browserApp.exportHint')}
        >
          <Button disabled={bookmarkCount === 0} onClick={onExportBookmarks}>
            {t('browserApp.export')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title={t('browserApp.storedData')}
        description={t('browserApp.storedDataHint')}
      >
        <SettingsRow
          label={t('browserApp.keepHistory')}
          description={t('browserApp.keepHistoryHint')}
          htmlFor={ids.keepHistory}
        >
          <Switch
            id={ids.keepHistory}
            checked={settings.keepHistory}
            onChange={(e) => onChange({ keepHistory: e.target.checked })}
          />
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.browsingHistory')}
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
            {t('browserApp.clearHistory')}
          </Button>
        </SettingsRow>
        <SettingsRow
          label={t('browserApp.bookmarks')}
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
            {t('browserApp.removeAll')}
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

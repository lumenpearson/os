import {
  Button,
  Input,
  Select,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  Switch,
  useDialogs,
} from '@lumen/ui';
import { useEffect, useId, useState } from 'react';
import type { BrowserData } from '../data';
import { SEARCH_ENGINES, START_URL } from '../url';

export interface BrowserSettingsProps {
  data: BrowserData;
  onChange: (patch: Partial<BrowserData>) => void;
  onClearHistory: () => void;
  onClearBookmarks: () => void;
}

const ENGINE_OPTIONS = SEARCH_ENGINES.map((e) => ({ value: e.id, label: e.name }));

/** Where Home goes, what a search means, and how to throw the record away. */
export function BrowserSettings({
  data,
  onChange,
  onClearHistory,
  onClearBookmarks,
}: BrowserSettingsProps) {
  const dialogs = useDialogs();
  const homeId = useId();
  const engineId = useId();
  const barId = useId();
  const [homepage, setHomepage] = useState(data.homepage);

  // The file is the source of truth; a change made elsewhere wins over a draft.
  useEffect(() => setHomepage(data.homepage), [data.homepage]);

  const commitHomepage = () => {
    const value = homepage.trim();
    if (!value) {
      setHomepage(data.homepage);
      return;
    }
    if (value !== data.homepage) onChange({ homepage: value });
  };

  const clearHistory = async () => {
    const ok = await dialogs.confirm({
      title: 'Clear browsing history?',
      message: `${data.history.length} ${data.history.length === 1 ? 'page' : 'pages'} will be removed from this browser. Bookmarks are kept.`,
      confirmLabel: 'Clear History',
      danger: true,
    });
    if (ok) onClearHistory();
  };

  const clearBookmarks = async () => {
    const ok = await dialogs.confirm({
      title: 'Remove every bookmark?',
      message: `${data.bookmarks.length} ${data.bookmarks.length === 1 ? 'bookmark' : 'bookmarks'} will be removed. This cannot be undone.`,
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
          description="The Home button and every new tab open here."
          htmlFor={homeId}
          stacked
        >
          <div className="flex w-full items-center gap-2">
            <Input
              id={homeId}
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
                if (e.key === 'Escape') setHomepage(data.homepage);
              }}
              className="flex-1"
            />
            <Button
              disabled={data.homepage === START_URL}
              onClick={() => {
                setHomepage(START_URL);
                onChange({ homepage: START_URL });
              }}
            >
              Use New Tab Page
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Search">
        <SettingsRow
          label="Search engine"
          description="Where the address bar sends text that is not an address."
          htmlFor={engineId}
        >
          <Select
            id={engineId}
            options={ENGINE_OPTIONS}
            value={data.searchEngine}
            onChange={(searchEngine) => onChange({ searchEngine })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <SettingsRow
          label="Bookmarks bar"
          description="A row of starred pages under the toolbar."
          htmlFor={barId}
        >
          <Switch
            id={barId}
            checked={data.showBookmarksBar}
            onChange={(e) => onChange({ showBookmarksBar: e.target.checked })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Stored data"
        description="Everything this browser keeps lives in one file under your home folder."
      >
        <SettingsRow
          label="Browsing history"
          description={
            data.history.length === 0
              ? 'Nothing recorded.'
              : `${data.history.length} ${data.history.length === 1 ? 'page' : 'pages'} recorded.`
          }
        >
          <Button
            variant="danger"
            disabled={data.history.length === 0}
            onClick={() => void clearHistory()}
          >
            Clear History
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Bookmarks"
          description={
            data.bookmarks.length === 0
              ? 'Nothing kept.'
              : `${data.bookmarks.length} ${data.bookmarks.length === 1 ? 'page' : 'pages'} kept.`
          }
        >
          <Button
            variant="danger"
            disabled={data.bookmarks.length === 0}
            onClick={() => void clearBookmarks()}
          >
            Remove All
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

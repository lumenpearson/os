import { DEFAULT_STORE_ORIGIN } from '@lumen/kernel';
import { useSetting } from '@lumen/kernel/react';
import {
  Button,
  Input,
  Select,
  type SelectOption,
  SettingsGroup,
  SettingsPage,
  Switch,
} from '@lumen/ui';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Row, Value } from '../Row';

// Minutes, as strings: the Select carries string values, and the page is the
// only place that has to know the difference.
const INTERVALS: SelectOption<string>[] = [
  { value: '0', label: 'Only when asked' },
  { value: '60', label: 'Every hour' },
  { value: '360', label: 'Every six hours' },
  { value: '1440', label: 'Every day' },
];

/** The last sync, or a sentence saying there has not been one. */
function syncedAt(at: number | null, locale: string): string {
  if (at === null) return 'Not yet fetched';
  return new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function StorePage() {
  const [store, patch] = useSetting('store');
  const [region] = useSetting('region');
  // The field is edited freely and only written back when it is left, so a
  // half-typed URL never becomes the address the storefront tries to fetch.
  const [draft, setDraft] = useState(store.origin);

  const commit = () => {
    const next = draft.trim();
    patch({ origin: next === '' ? DEFAULT_STORE_ORIGIN : next });
    if (next === '') setDraft(DEFAULT_STORE_ORIGIN);
  };

  return (
    <SettingsPage title="Store" description="Where programs, fonts and icon sets are fetched from.">
      <SettingsGroup title="Catalogue">
        <Row
          id="store.origin"
          label="Address"
          description="A directory of static files. A path is served beside Lumen; a full URL is a store hosted on its own."
        >
          <Input
            className="mono w-72"
            value={draft}
            spellCheck={false}
            aria-label="Store address"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <Button
            size="sm"
            icon={<RotateCcw className="size-3.5" />}
            disabled={draft === DEFAULT_STORE_ORIGIN && store.origin === DEFAULT_STORE_ORIGIN}
            onClick={() => {
              setDraft(DEFAULT_STORE_ORIGIN);
              patch({ origin: DEFAULT_STORE_ORIGIN });
            }}
          >
            Default
          </Button>
        </Row>
        <Row id="store.lastSync" label="Last fetched">
          <Value>{syncedAt(store.lastSync, region.locale)}</Value>
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Refreshing">
        <Row
          id="store.autoSync"
          label="Fetch the catalogue on its own"
          description="Off leaves it to the Refresh button in the Software app."
        >
          <Switch
            checked={store.autoSync}
            onChange={(e) => patch({ autoSync: e.target.checked })}
          />
        </Row>
        <Row id="store.syncMinutes" label="How often">
          <Select
            options={INTERVALS}
            value={String(store.syncMinutes)}
            disabled={!store.autoSync}
            onChange={(minutes) => patch({ syncMinutes: Number(minutes) })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

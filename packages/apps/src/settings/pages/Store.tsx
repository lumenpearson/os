import type { Translate } from '@lumen/kernel';
import { DEFAULT_STORE_ORIGIN } from '@lumen/kernel';
import { useSetting, useT } from '@lumen/kernel/react';
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
/*
 * A function of the translator, not a table built at import: a table would
 * keep whatever language was in force when the module first loaded.
 */
const intervalOptions = (t: Translate): SelectOption<string>[] => [
  { value: '0', label: t('storePage.onlyWhenAsked') },
  { value: '60', label: t('storePage.everyHour') },
  { value: '360', label: t('storePage.everySixHours') },
  { value: '1440', label: t('storePage.everyDay') },
];

/** The last sync, or a sentence saying there has not been one. */
function syncedAt(at: number | null, locale: string): string {
  if (at === null) return 'Not yet fetched';
  return new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function StorePage() {
  const t = useT();
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
    <SettingsPage title={t('settings.store')} description={t('storePage.intro')}>
      <SettingsGroup title={t('storePage.catalogue')}>
        <Row
          id="store.origin"
          label={t('storePage.address')}
          description={t('storePage.addressHint')}
        >
          <Input
            className="mono w-72"
            value={draft}
            spellCheck={false}
            aria-label={t('storePage.storeAddress')}
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
            {t('storePage.default')}
          </Button>
        </Row>
        <Row id="store.lastSync" label={t('storePage.lastFetched')}>
          <Value>{syncedAt(store.lastSync, region.locale)}</Value>
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('storePage.refreshing')}>
        <Row
          id="store.autoSync"
          label={t('storePage.autoFetch')}
          description={t('storePage.autoFetchHint')}
        >
          <Switch
            checked={store.autoSync}
            onChange={(e) => patch({ autoSync: e.target.checked })}
          />
        </Row>
        <Row id="store.syncMinutes" label={t('storePage.howOften')}>
          <Select
            options={intervalOptions(t)}
            value={String(store.syncMinutes)}
            disabled={!store.autoSync}
            onChange={(minutes) => patch({ syncMinutes: Number(minutes) })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

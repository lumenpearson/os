/**
 * The store's own settings, inside the store.
 *
 * Settings > Store has the same address and the same schedule, because there
 * is one catalogue and one setting behind it. This section exists because a
 * person who has just watched the storefront fail to load is already in the
 * store, and sending them to another app to find out why is a worse answer
 * than telling them here — so this one also says where the catalogue in hand
 * actually came from, which the Settings app has no way to know.
 */

import { DEFAULT_STORE_ORIGIN } from '@lumen/kernel';
import { useSetting } from '@lumen/kernel/react';
import { Button, Input, Select, SettingsGroup, SettingsRow, Switch } from '@lumen/ui';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { CatalogueView } from './source';
import { describeOrigin, SYNC_INTERVALS, syncedAt } from './storeSettings';

export interface SettingsSectionProps {
  view: CatalogueView;
  /** The account's locale, for the dates. */
  locale: string;
  onRefresh: () => void;
}

export function SettingsSection({ view, locale, onRefresh }: SettingsSectionProps) {
  const [store, patchStore] = useSetting('store');
  const [updates, patchUpdates] = useSetting('updates');
  // Edited freely and written back only when the field is left, so a
  // half-typed address never becomes the one the storefront tries to fetch.
  const [draft, setDraft] = useState(store.origin);

  const commit = () => {
    const next = draft.trim();
    patchStore({ origin: next === '' ? DEFAULT_STORE_ORIGIN : next });
    if (next === '') setDraft(DEFAULT_STORE_ORIGIN);
  };
  const atDefault = draft === DEFAULT_STORE_ORIGIN && store.origin === DEFAULT_STORE_ORIGIN;

  return (
    <div className="lumen-scroll flex-1 p-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <SettingsGroup title="Catalogue">
          <SettingsRow
            label="Address"
            description="A directory of static files. A path is served beside Lumen; a full URL is a store hosted on its own."
          >
            <Input
              className="mono w-64"
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
              disabled={atDefault}
              onClick={() => {
                setDraft(DEFAULT_STORE_ORIGIN);
                patchStore({ origin: DEFAULT_STORE_ORIGIN });
              }}
            >
              Default
            </Button>
          </SettingsRow>
          <SettingsRow
            label="What is on screen"
            description={describeOrigin(view.origin, view.fetchedAt, locale)}
          >
            <Button size="sm" onClick={onRefresh} disabled={view.refreshing}>
              {view.refreshing ? 'Fetching…' : 'Fetch now'}
            </Button>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Refreshing">
          <SettingsRow
            label="Fetch the catalogue on its own"
            description="Off leaves it to Fetch now, above."
          >
            <Switch
              checked={store.autoSync}
              aria-label="Fetch the catalogue on its own"
              onChange={(e) => patchStore({ autoSync: e.target.checked })}
            />
          </SettingsRow>
          <SettingsRow label="How often">
            <Select
              options={SYNC_INTERVALS}
              aria-label="How often to fetch the catalogue"
              value={String(store.syncMinutes)}
              disabled={!store.autoSync}
              onChange={(minutes) => patchStore({ syncMinutes: Number(minutes) })}
            />
          </SettingsRow>
          <SettingsRow label="Last fetched" description={syncedAt(store.lastSync, locale)} />
        </SettingsGroup>

        <SettingsGroup title="Updates">
          <SettingsRow
            label="Install updates as they are found"
            description="Off lists them in Updates and waits."
          >
            <Switch
              checked={updates.automatic}
              aria-label="Install updates as they are found"
              onChange={(e) => patchUpdates({ automatic: e.target.checked })}
            />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
}

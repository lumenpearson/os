import { AVATAR_PRESETS } from '@lumen/kernel';
import { useClock, useCurrentUser, useKernel, useSetting } from '@lumen/kernel/react';
import { Avatar, Button, cx, Input, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { Info, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { formatRelative, useLauncher } from '../../_sdk';
import { useUpdates } from '../../software/useUpdates';
import { useSystemInfo } from '../hooks';
import { updateStatus } from '../logic';
import { ChoiceGroup, Row, Value } from '../Row';

export function GeneralPage() {
  const kernel = useKernel();
  const user = useCurrentUser();
  const { info } = useSystemInfo();
  const { launch } = useLauncher();
  const [updates, patchUpdates] = useSetting('updates');
  const store = useUpdates();
  const now = useClock(30_000);

  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? user?.name ?? '';
  const commitName = () => {
    const next = name.trim();
    if (next && next !== user?.name) void kernel.updateUser({ name: next });
    setDraft(null);
  };

  const version = info?.appVersion ?? '0.1.0';
  const hostLabel = info ? (info.host === 'tauri' ? 'Desktop (Tauri)' : 'Web browser') : '…';

  return (
    <SettingsPage title="General" description="Your account, this computer, and software updates.">
      <SettingsGroup title="User">
        <Row id="general.user" label="Name and avatar" stacked>
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={user?.name ?? ''} src={user?.avatar} size={40} />
              <Input
                aria-label="Name"
                value={name}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setDraft(null);
                }}
                className="max-w-64"
              />
              {user && <Value>@{user.username}</Value>}
            </div>
            <ChoiceGroup
              label="Avatar"
              labelHidden
              value={user?.avatar ?? ''}
              onChange={(avatar) => void kernel.updateUser({ avatar })}
              options={AVATAR_PRESETS.map((p) => ({
                value: p.id,
                label: p.label,
                render: (selected) => (
                  <Avatar
                    name={user?.name ?? ''}
                    src={p.id}
                    size={32}
                    className={cx(selected && 'outline-2 outline-accent outline-offset-2')}
                  />
                ),
              }))}
            />
          </div>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Computer">
        <Row id="general.computer" label="Computer name" description="Set by the host.">
          <Value>{info?.hostname ?? '…'}</Value>
        </Row>
        <Row id="general.about" label="About this computer" stacked>
          <dl className="mono grid w-full grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-ink-3">OS</dt>
            <dd className="text-ink-2 select-text">Lumen OS {version}</dd>
            <dt className="text-ink-3">Kernel</dt>
            <dd className="text-ink-2 select-text">{info?.kernel ?? '…'}</dd>
            <dt className="text-ink-3">Host</dt>
            <dd className="text-ink-2 select-text">{hostLabel}</dd>
          </dl>
          <div>
            <Button
              size="sm"
              icon={<Info className="size-3.5" />}
              onClick={() => launch('lumen.sysinfo')}
            >
              System Information
            </Button>
          </div>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Software update">
        <Row
          id="general.version"
          label="This system"
          description="Lumen OS is updated by replacing the build it runs from; there is no release feed to check."
        >
          <Value>Lumen OS {version}</Value>
        </Row>
        <Row
          id="general.updates"
          label="Installed packages"
          description={updateStatus(
            {
              checking: store.checking,
              lastChecked: store.lastChecked,
              available: store.updates.length,
              error: store.error?.message ?? null,
            },
            (t) => formatRelative(t, now.getTime()),
          )}
        >
          <Button
            size="sm"
            loading={store.checking}
            icon={<RefreshCw className="size-3.5" />}
            onClick={store.check}
          >
            Check for updates
          </Button>
          {store.updates.length > 0 && (
            <Button size="sm" onClick={() => launch('lumen.software', { section: 'installed' })}>
              Open Software Center
            </Button>
          )}
        </Row>
        <Row
          id="general.updates.automatic"
          htmlFor="updates-automatic"
          label="Automatic updates"
          description="Install a newer version as soon as Software Center finds one in the store."
        >
          <Switch
            id="updates-automatic"
            checked={updates.automatic}
            onChange={(e) => patchUpdates({ automatic: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

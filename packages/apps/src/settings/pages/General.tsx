import { AVATAR_PRESETS } from '@lumen/kernel';
import { useClock, useCurrentUser, useKernel, useSetting } from '@lumen/kernel/react';
import {
  Avatar,
  Button,
  cx,
  Input,
  Select,
  type SelectOption,
  SettingsGroup,
  SettingsPage,
  Switch,
} from '@lumen/ui';
import { Info, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatRelative, useLauncher } from '../../_sdk';
import { useSystemInfo } from '../hooks';
import { updateStatus } from '../logic';
import { ChoiceGroup, Row, Value } from '../Row';

const CHANNELS: SelectOption<'stable' | 'beta'>[] = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
];

const CHECK_DELAY_MS = 1200;

export function GeneralPage() {
  const kernel = useKernel();
  const user = useCurrentUser();
  const { info } = useSystemInfo();
  const { launch } = useLauncher();
  const [updates, patchUpdates] = useSetting('updates');
  const now = useClock(30_000);

  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? user?.name ?? '';
  const commitName = () => {
    const next = name.trim();
    if (next && next !== user?.name) void kernel.updateUser({ name: next });
    setDraft(null);
  };

  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const check = () => {
    setChecking(true);
    timer.current = setTimeout(() => {
      patchUpdates({ lastChecked: Date.now() });
      setChecking(false);
    }, CHECK_DELAY_MS);
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
          id="general.updates"
          label={
            checking
              ? 'Checking for updates…'
              : updateStatus(updates.lastChecked, version, (t) => formatRelative(t, now.getTime()))
          }
        >
          <Button
            size="sm"
            loading={checking}
            icon={<RefreshCw className="size-3.5" />}
            onClick={check}
          >
            Check for updates
          </Button>
        </Row>
        <Row id="general.updates.channel" label="Update channel">
          <Select
            options={CHANNELS}
            value={updates.channel}
            onChange={(channel) => patchUpdates({ channel })}
          />
        </Row>
        <Row
          id="general.updates.automatic"
          label="Automatic updates"
          description="Install updates when they are available."
        >
          <Switch
            checked={updates.automatic}
            onChange={(e) => patchUpdates({ automatic: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

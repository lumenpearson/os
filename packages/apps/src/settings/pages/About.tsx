import { useClock, usePlatform } from '@lumen/kernel/react';
import { Button, SettingsGroup, SettingsPage } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { ExternalLink } from 'lucide-react';
import { useSystemInfo } from '../hooks';
import { formatDuration, viewportLabel } from '../logic';
import { Row, Value } from '../Row';

const REPO_URL = 'https://github.com/lumenpearson/os';

export function AboutPage() {
  const platform = usePlatform();
  const { info, fetchedAt } = useSystemInfo();
  const now = useClock();
  const uptime = info ? info.uptime + Math.max(0, (now.getTime() - fetchedAt) / 1000) : null;
  const os = info
    ? `${info.os.name} ${info.os.version}`.trim() +
      (info.os.arch !== 'unknown' ? ` (${info.os.arch})` : '')
    : '…';

  return (
    <SettingsPage title="About">
      <div className="flex flex-col gap-1 px-1">
        <p className="text-2xl font-semibold tracking-tight text-ink">Lumen OS</p>
        <Value>
          version {info?.appVersion ?? '…'} · {info?.kernel ?? '…'}
        </Value>
      </div>

      <SettingsGroup title="System">
        <Row id="about.system" label="Host">
          <Value>{info ? (info.host === 'tauri' ? 'Desktop (Tauri)' : 'Web browser') : '…'}</Value>
        </Row>
        <Row id="about.system.os" label="Platform">
          <Value>{os}</Value>
        </Row>
        <Row id="about.system.cpu" label="Processor">
          <Value>{info ? `${info.cpu.model} · ${info.cpu.cores} cores` : '…'}</Value>
        </Row>
        <Row id="about.system.memory" label="Memory">
          <Value>
            {info
              ? `${formatBytes(info.memory.total, 0)} total · ${formatBytes(info.memory.available, 0)} available`
              : '…'}
          </Value>
        </Row>
        <Row id="about.system.display" label="Display">
          <Value>
            {info
              ? viewportLabel(info.display.width, info.display.height, info.display.scale)
              : '…'}
          </Value>
        </Row>
        <Row id="about.system.uptime" label="Uptime">
          <Value>{uptime === null ? '…' : formatDuration(uptime)}</Value>
        </Row>
        <Row id="about.userAgent" label="User agent" stacked>
          <div className="mono lumen-scroll max-h-16 w-full select-text rounded-sm border border-rule bg-canvas px-3 py-2 text-xs break-all text-ink-2">
            {info?.userAgent || '…'}
          </div>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Source">
        <Row id="about.links" label="Lumen OS is open source" description="MIT licence.">
          <Button
            size="sm"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => void platform.shell.openExternal(REPO_URL)}
          >
            GitHub
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

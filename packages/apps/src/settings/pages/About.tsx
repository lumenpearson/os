import { useClock, usePlatform, useT } from '@lumen/kernel/react';
import { Button, SettingsGroup, SettingsPage } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { ExternalLink } from 'lucide-react';
import { useSystemInfo } from '../hooks';
import { formatDuration, viewportLabel } from '../logic';
import { Row, Value } from '../Row';

const REPO_URL = 'https://github.com/lumenpearson/os';

export function AboutPage() {
  const t = useT();
  const platform = usePlatform();
  const { info, fetchedAt } = useSystemInfo();
  const now = useClock();
  const uptime = info ? info.uptime + Math.max(0, (now.getTime() - fetchedAt) / 1000) : null;
  const os = info
    ? `${info.os.name} ${info.os.version}`.trim() +
      (info.os.arch !== 'unknown' ? ` (${info.os.arch})` : '')
    : '…';

  return (
    <SettingsPage title={t('settings.about')}>
      <div className="flex flex-col gap-1 px-1">
        {/* i18n-ignore-next-line the product's name, which is the same in every language */}
        <p className="text-2xl font-semibold tracking-tight text-ink">Lumen OS</p>
        <Value>
          {t('aboutPage.version')} {info?.appVersion ?? '…'} · {info?.kernel ?? '…'}
        </Value>
      </div>

      <SettingsGroup title={t('aboutPage.system')}>
        <Row id="about.system" label={t('aboutPage.host')}>
          <Value>{info ? (info.host === 'tauri' ? 'Desktop (Tauri)' : 'Web browser') : '…'}</Value>
        </Row>
        <Row id="about.system.os" label={t('aboutPage.platform')}>
          <Value>{os}</Value>
        </Row>
        <Row id="about.system.cpu" label={t('aboutPage.processor')}>
          <Value>{info ? `${info.cpu.model} · ${info.cpu.cores} cores` : '…'}</Value>
        </Row>
        <Row id="about.system.memory" label={t('aboutPage.memory')}>
          <Value>
            {info
              ? `${formatBytes(info.memory.total, 0)} total · ${formatBytes(info.memory.available, 0)} available`
              : '…'}
          </Value>
        </Row>
        <Row id="about.system.display" label={t('aboutPage.display')}>
          <Value>
            {info
              ? viewportLabel(info.display.width, info.display.height, info.display.scale)
              : '…'}
          </Value>
        </Row>
        <Row id="about.system.uptime" label={t('aboutPage.uptime')}>
          <Value>{uptime === null ? '…' : formatDuration(uptime)}</Value>
        </Row>
        <Row id="about.userAgent" label={t('aboutPage.userAgent')} stacked>
          <div className="mono lumen-scroll max-h-16 w-full select-text rounded-sm border border-rule bg-canvas px-3 py-2 text-xs break-all text-ink-2">
            {info?.userAgent || '…'}
          </div>
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('aboutPage.source')}>
        <Row
          id="about.links"
          label={t('aboutPage.openSource')}
          description={t('aboutPage.licence')}
        >
          <Button
            size="sm"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => void platform.shell.openExternal(REPO_URL)}
          >
            {t('aboutPage.github')}
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

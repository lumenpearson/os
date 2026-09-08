import { useKernel, useSetting, useT } from '@lumen/kernel/react';
import { Button, Select, SettingsGroup, SettingsPage, Switch, useDialogs } from '@lumen/ui';
import { Moon, Power, RotateCcw } from 'lucide-react';
import { MINUTE_OPTIONS, parseMinutes } from '../logic';
import { Row } from '../Row';

export function PowerPage() {
  const t = useT();
  const kernel = useKernel();
  const dialogs = useDialogs();
  const [power, patch] = useSetting('power');

  const restart = async () => {
    if (
      await dialogs.confirm({
        title: t('powerPage.restartNow'),
        message: t('powerPage.windowsWillClose'),
        confirmLabel: 'Restart',
      })
    )
      void kernel.restart();
  };
  const shutdown = async () => {
    if (
      await dialogs.confirm({
        title: t('powerPage.shutDownNow'),
        message: t('powerPage.windowsWillClose'),
        confirmLabel: 'Shut Down',
        danger: true,
      })
    )
      void kernel.shutdown();
  };

  return (
    <SettingsPage title={t('settings.power')} description={t('powerPage.intro')}>
      <SettingsGroup title={t('powerPage.idle')}>
        <Row
          id="power.sleep"
          label={t('powerPage.sleepAfter')}
          description={t('powerPage.sleepAfterHint')}
        >
          <Select
            options={MINUTE_OPTIONS}
            value={String(power.sleepAfterMinutes)}
            onChange={(v) => patch({ sleepAfterMinutes: parseMinutes(v) })}
          />
        </Row>
        <Row
          id="power.lowPower"
          label={t('powerPage.lowPower')}
          description={t('powerPage.lowPowerHint')}
        >
          <Switch
            checked={power.lowPowerMode}
            onChange={(e) => patch({ lowPowerMode: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('powerPage.session')}>
        <Row id="power.actions" label={t('powerPage.sessionControls')}>
          <Button size="sm" icon={<Moon className="size-3.5" />} onClick={() => kernel.sleep()}>
            {t('powerPage.sleep')}
          </Button>
          <Button
            size="sm"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => void restart()}
          >
            {t('powerPage.restart')}
          </Button>
          <Button size="sm" icon={<Power className="size-3.5" />} onClick={() => void shutdown()}>
            {t('powerPage.shutDown')}
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

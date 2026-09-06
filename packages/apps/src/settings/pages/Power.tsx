import { useKernel, useSetting } from '@lumen/kernel/react';
import { Button, Select, SettingsGroup, SettingsPage, Switch, useDialogs } from '@lumen/ui';
import { Moon, Power, RotateCcw } from 'lucide-react';
import { MINUTE_OPTIONS, parseMinutes } from '../logic';
import { Row } from '../Row';

export function PowerPage() {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const [power, patch] = useSetting('power');

  const restart = async () => {
    if (
      await dialogs.confirm({
        title: 'Restart now?',
        message: 'Open windows will close.',
        confirmLabel: 'Restart',
      })
    )
      void kernel.restart();
  };
  const shutdown = async () => {
    if (
      await dialogs.confirm({
        title: 'Shut down now?',
        message: 'Open windows will close.',
        confirmLabel: 'Shut Down',
        danger: true,
      })
    )
      void kernel.shutdown();
  };

  return (
    <SettingsPage title="Power" description="Idle behaviour and the session controls.">
      <SettingsGroup title="Idle">
        <Row
          id="power.sleep"
          label="Sleep after"
          description="Turns the screen dark until you move the mouse or press a key."
        >
          <Select
            options={MINUTE_OPTIONS}
            value={String(power.sleepAfterMinutes)}
            onChange={(v) => patch({ sleepAfterMinutes: parseMinutes(v) })}
          />
        </Row>
        <Row
          id="power.lowPower"
          label="Low power mode"
          description="Holds animation, transparency, window shadows and taskbar magnification off. Your own settings for those are kept and come back when it is switched off."
        >
          <Switch
            checked={power.lowPowerMode}
            onChange={(e) => patch({ lowPowerMode: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Session">
        <Row id="power.actions" label="Sleep, restart or shut down">
          <Button size="sm" icon={<Moon className="size-3.5" />} onClick={() => kernel.sleep()}>
            Sleep
          </Button>
          <Button
            size="sm"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => void restart()}
          >
            Restart
          </Button>
          <Button size="sm" icon={<Power className="size-3.5" />} onClick={() => void shutdown()}>
            Shut Down
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

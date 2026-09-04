import { useSetting } from '@lumen/kernel/react';
import { SettingsGroup, SettingsPage, Slider, Switch } from '@lumen/ui';
import { Row } from '../Row';

export function SoundPage() {
  const [sound, patch] = useSetting('sound');
  return (
    <SettingsPage title="Sound" description="Output volume and interface sounds.">
      <SettingsGroup title="Output">
        <Row id="sound.volume" label="Volume" stacked>
          <Slider
            aria-label="Volume"
            min={0}
            max={100}
            step={1}
            value={Math.round(sound.volume * 100)}
            onChange={(v) => patch({ volume: v / 100 })}
            disabled={sound.muted}
            showValue={(v) => `${v}%`}
          />
        </Row>
        <Row id="sound.mute" label="Mute">
          <Switch checked={sound.muted} onChange={(e) => patch({ muted: e.target.checked })} />
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Interface">
        <Row id="sound.ui" label="Interface sounds" description="Clicks, alerts and notifications.">
          <Switch
            checked={sound.uiSounds}
            onChange={(e) => patch({ uiSounds: e.target.checked })}
          />
        </Row>
        <Row id="sound.startup" label="Startup sound">
          <Switch
            checked={sound.startupSound}
            onChange={(e) => patch({ startupSound: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

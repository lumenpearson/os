import { useSetting, useT } from '@lumen/kernel/react';
import { SettingsGroup, SettingsPage, Slider, Switch } from '@lumen/ui';
import { Row } from '../Row';

export function SoundPage() {
  const t = useT();
  const [sound, patch] = useSetting('sound');
  return (
    <SettingsPage title={t('settings.sound')} description={t('soundPage.intro')}>
      <SettingsGroup title={t('soundPage.output')}>
        <Row id="sound.volume" label={t('soundPage.volume')} stacked>
          <Slider
            aria-label={t('soundPage.volume')}
            min={0}
            max={100}
            step={1}
            value={Math.round(sound.volume * 100)}
            onChange={(v) => patch({ volume: v / 100 })}
            disabled={sound.muted}
            showValue={(v) => `${v}%`}
          />
        </Row>
        <Row id="sound.mute" label={t('soundPage.mute')}>
          <Switch checked={sound.muted} onChange={(e) => patch({ muted: e.target.checked })} />
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('soundPage.interface')}>
        <Row
          id="sound.ui"
          label={t('soundPage.interfaceSounds')}
          description={t('soundPage.interfaceSoundsHint')}
        >
          <Switch
            checked={sound.uiSounds}
            onChange={(e) => patch({ uiSounds: e.target.checked })}
          />
        </Row>
        <Row id="sound.startup" label={t('soundPage.startupSound')}>
          <Switch
            checked={sound.startupSound}
            onChange={(e) => patch({ startupSound: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

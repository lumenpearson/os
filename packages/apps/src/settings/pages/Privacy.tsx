import { useLogStore } from '@lumen/kernel';
import { useKernel, useSetting, useT } from '@lumen/kernel/react';
import { Button, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { Row } from '../Row';

export function PrivacyPage() {
  const t = useT();
  const kernel = useKernel();
  const [privacy, patch] = useSetting('privacy');
  return (
    <SettingsPage title={t('settings.privacy')} description={t('privacyPage.intro')}>
      <SettingsGroup title={t('privacyPage.history')}>
        <Row
          id="privacy.recents"
          label={t('privacyPage.keepRecents')}
          description={t('privacyPage.keepRecentsHint')}
        >
          <Button size="sm" onClick={() => kernel.updateState({ recents: [] })}>
            {t('privacyPage.clearRecents')}
          </Button>
          <Switch
            checked={privacy.recents}
            onChange={(e) => patch({ recents: e.target.checked })}
          />
        </Row>
        <Row
          id="privacy.logging"
          label={t('privacyPage.keepLog')}
          description={t('privacyPage.keepLogHint')}
        >
          <Button size="sm" onClick={() => useLogStore.getState().clear()}>
            {t('privacyPage.clearLog')}
          </Button>
          <Switch
            checked={privacy.logging}
            onChange={(e) => {
              patch({ logging: e.target.checked });
              useLogStore.getState().setEnabled(e.target.checked);
            }}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('privacyPage.data')}>
        <Row
          id="privacy.note"
          label={t('privacyPage.local')}
          description={t('privacyPage.localHint')}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

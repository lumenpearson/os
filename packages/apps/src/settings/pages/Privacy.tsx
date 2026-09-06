import { useLogStore } from '@lumen/kernel';
import { useKernel, useSetting } from '@lumen/kernel/react';
import { Button, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { Row } from '../Row';

export function PrivacyPage() {
  const kernel = useKernel();
  const [privacy, patch] = useSetting('privacy');
  return (
    <SettingsPage title="Privacy" description="What the system remembers about your session.">
      <SettingsGroup title="History">
        <Row
          id="privacy.recents"
          label="Keep Recents"
          description="Files you open appear in the Start menu and in Files."
        >
          <Button size="sm" onClick={() => kernel.updateState({ recents: [] })}>
            Clear recents
          </Button>
          <Switch
            checked={privacy.recents}
            onChange={(e) => patch({ recents: e.target.checked })}
          />
        </Row>
        <Row
          id="privacy.logging"
          label="Keep session log"
          description="Kernel and app messages, readable in the Console."
        >
          <Button size="sm" onClick={() => useLogStore.getState().clear()}>
            Clear log
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
      <SettingsGroup title="Data">
        <Row
          id="privacy.note"
          label="Everything stays on this device"
          description="Settings, files, the user account and the log are stored locally. Nothing is sent anywhere."
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

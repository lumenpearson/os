import { useSetting, useT } from '@lumen/kernel/react';
import { Input, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { networkStatus } from '../logic';
import { Row, Value } from '../Row';

export function NetworkPage() {
  const t = useT();
  const [network, patch] = useSetting('network');
  const grounded = network.airplane;
  return (
    <SettingsPage title={t('settings.network')} description={t('networkPage.intro')}>
      <SettingsGroup title={t('networkPage.radios')}>
        <Row id="network.wifi" label={t('controlCenter.wifi')}>
          <Switch
            checked={network.wifi && !grounded}
            disabled={grounded}
            onChange={(e) => patch({ wifi: e.target.checked })}
          />
        </Row>
        <Row
          id="network.ssid"
          label={t('networkPage.networkName')}
          description={t('networkPage.networkNameHint')}
        >
          <Input
            aria-label={t('networkPage.networkName')}
            mono
            value={network.ssid}
            onChange={(e) => patch({ ssid: e.target.value })}
            disabled={grounded || !network.wifi}
            className="max-w-56"
          />
        </Row>
        <Row id="network.bluetooth" label={t('controlCenter.bluetooth')}>
          <Switch
            checked={network.bluetooth && !grounded}
            disabled={grounded}
            onChange={(e) => patch({ bluetooth: e.target.checked })}
          />
        </Row>
        <Row
          id="network.airplane"
          label={t('networkPage.airplane')}
          description={t('networkPage.airplaneHint')}
        >
          <Switch
            checked={network.airplane}
            onChange={(e) => patch({ airplane: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('networkPage.status')}>
        <Row id="network.status" label={t('networkPage.status')}>
          <Value>{networkStatus(network)}</Value>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

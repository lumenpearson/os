import { useSetting } from '@lumen/kernel/react';
import { Input, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { networkStatus } from '../logic';
import { Row, Value } from '../Row';

export function NetworkPage() {
  const [network, patch] = useSetting('network');
  const grounded = network.airplane;
  return (
    <SettingsPage
      title="Network"
      description="Simulated radios. The status line is what the menubar shows."
    >
      <SettingsGroup title="Radios">
        <Row id="network.wifi" label="Wi-Fi">
          <Switch
            checked={network.wifi && !grounded}
            disabled={grounded}
            onChange={(e) => patch({ wifi: e.target.checked })}
          />
        </Row>
        <Row id="network.ssid" label="Network name" description="Shown when Wi-Fi is on.">
          <Input
            aria-label="Network name"
            mono
            value={network.ssid}
            onChange={(e) => patch({ ssid: e.target.value })}
            disabled={grounded || !network.wifi}
            className="max-w-56"
          />
        </Row>
        <Row id="network.bluetooth" label="Bluetooth">
          <Switch
            checked={network.bluetooth && !grounded}
            disabled={grounded}
            onChange={(e) => patch({ bluetooth: e.target.checked })}
          />
        </Row>
        <Row
          id="network.airplane"
          label="Airplane mode"
          description="Turns off Wi-Fi and Bluetooth."
        >
          <Switch
            checked={network.airplane}
            onChange={(e) => patch({ airplane: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Status">
        <Row id="network.status" label="Status">
          <Value>{networkStatus(network)}</Value>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

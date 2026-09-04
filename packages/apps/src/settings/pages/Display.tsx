import { useSetting } from '@lumen/kernel/react';
import { SettingsGroup, SettingsPage, Slider, Switch } from '@lumen/ui';
import { useViewport } from '../hooks';
import { percentLabel, viewportLabel } from '../logic';
import { Row, Value } from '../Row';

const BASE_FONT_PX = 13;

export function DisplayPage() {
  const [display, patch] = useSetting('display');
  const vp = useViewport();
  return (
    <SettingsPage
      title="Display"
      description="Interface scale, window behaviour and the current viewport."
    >
      <SettingsGroup title="Scale">
        <Row
          id="display.scale"
          label="Scale"
          description="Resizes every part of the interface."
          stacked
        >
          <Slider
            aria-label="Scale"
            min={0.75}
            max={1.75}
            step={0.05}
            value={display.scale}
            onChange={(scale) => patch({ scale })}
            showValue={percentLabel}
          />
          <div className="flex w-full items-baseline gap-4 rounded-sm border border-rule bg-canvas px-4 py-3">
            <span
              className="font-medium text-ink"
              style={{ fontSize: BASE_FONT_PX * display.scale, lineHeight: 1.3 }}
            >
              Lumen OS
            </span>
            <Value>
              {BASE_FONT_PX} × {display.scale.toFixed(2)} ={' '}
              {(BASE_FONT_PX * display.scale).toFixed(2)} px
            </Value>
          </div>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Windows">
        <Row
          id="display.snapping"
          label="Snap to edges"
          description="Drag a window to a screen edge to tile it."
        >
          <Switch
            checked={display.snapping}
            onChange={(e) => patch({ snapping: e.target.checked })}
          />
        </Row>
        <Row id="display.shadows" label="Window shadows" description="Turn off on slow machines.">
          <Switch
            checked={display.shadows}
            onChange={(e) => patch({ shadows: e.target.checked })}
          />
        </Row>
        <Row
          id="display.overlay"
          label="Performance overlay"
          description="Frame rate and memory in a corner of the screen."
        >
          <Switch
            checked={display.performanceOverlay}
            onChange={(e) => patch({ performanceOverlay: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Viewport">
        <Row
          id="display.viewport"
          label="Current viewport"
          description="CSS pixels and device pixel ratio."
        >
          <Value>{viewportLabel(vp.width, vp.height, vp.dpr)}</Value>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

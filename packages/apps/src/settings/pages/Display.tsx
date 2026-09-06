import { useSetting } from '@lumen/kernel/react';
import { SettingsGroup, SettingsPage, Slider, Switch } from '@lumen/ui';
import { useViewport } from '../hooks';
import { percentLabel, pixelLabel, viewportLabel } from '../logic';
import { Row, Value } from '../Row';

const BASE_FONT_PX = 13;

export function DisplayPage() {
  const [display, patch] = useSetting('display');
  const [windows, patchWindows] = useSetting('windows');
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

      <SettingsGroup title="Tiling">
        <Row
          id="display.tilingGap"
          label="Gap between tiled windows"
          description="The margin a tiled window keeps from the screen edges and from its neighbour."
          stacked
        >
          <Slider
            aria-label="Gap between tiled windows"
            min={0}
            max={32}
            step={2}
            value={windows.tilingGap}
            onChange={(tilingGap) => patchWindows({ tilingGap })}
            showValue={pixelLabel}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Full screen">
        <Row
          id="display.fullscreenCoversPanels"
          htmlFor="windows-fullscreen-covers-panels"
          label="Cover the panels"
          description="Off: a full-screen window stops at the menubar and the taskbar."
        >
          <Switch
            id="windows-fullscreen-covers-panels"
            checked={windows.fullscreenCoversPanels}
            onChange={(e) => patchWindows({ fullscreenCoversPanels: e.target.checked })}
          />
        </Row>
        <Row
          id="display.fullscreenHidesTitleBar"
          htmlFor="windows-fullscreen-hides-title-bar"
          label="Hide the title bar"
          description="The window controls go away with it, the way macOS does."
        >
          <Switch
            id="windows-fullscreen-hides-title-bar"
            checked={windows.fullscreenHidesTitleBar}
            onChange={(e) => patchWindows({ fullscreenHidesTitleBar: e.target.checked })}
          />
        </Row>
        <Row
          id="display.immersiveSystemBar"
          htmlFor="windows-immersive-system-bar"
          label="Slide the menubar away"
          description="It comes back when the pointer reaches the top edge."
        >
          <Switch
            id="windows-immersive-system-bar"
            checked={windows.immersiveSystemBar}
            disabled={!windows.fullscreenCoversPanels}
            onChange={(e) => patchWindows({ immersiveSystemBar: e.target.checked })}
          />
        </Row>
        <Row
          id="display.immersiveTaskbar"
          htmlFor="windows-immersive-taskbar"
          label="Slide the taskbar away"
          description="Likewise, from the edge it sits on."
        >
          <Switch
            id="windows-immersive-taskbar"
            checked={windows.immersiveTaskbar}
            disabled={!windows.fullscreenCoversPanels}
            onChange={(e) => patchWindows({ immersiveTaskbar: e.target.checked })}
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

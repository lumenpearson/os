import { useSetting, useT } from '@lumen/kernel/react';
import { SettingsGroup, SettingsPage, Slider, Switch } from '@lumen/ui';
import { useViewport } from '../hooks';
import { percentLabel, pixelLabel, viewportLabel } from '../logic';
import { Row, Value } from '../Row';

const BASE_FONT_PX = 13;

export function DisplayPage() {
  const t = useT();
  const [display, patch] = useSetting('display');
  const [windows, patchWindows] = useSetting('windows');
  const vp = useViewport();
  return (
    <SettingsPage title={t('settings.display')} description={t('displayPage.intro')}>
      <SettingsGroup title={t('displayPage.titleScale')}>
        <Row
          id="display.scale"
          label={t('displayPage.titleScale')}
          description={t('displayPage.scaleHint')}
          stacked
        >
          <Slider
            aria-label={t('displayPage.titleScale')}
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
              {/* i18n-ignore-next-line the product's name, which is the same in every language */}
              Lumen OS
            </span>
            <Value>
              {BASE_FONT_PX} × {display.scale.toFixed(2)} ={' '}
              {/* i18n-ignore-next-line the symbol for the CSS pixel, not a word */}
              {(BASE_FONT_PX * display.scale).toFixed(2)} px
            </Value>
          </div>
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('displayPage.titleWindows')}>
        <Row
          id="display.snapping"
          label={t('displayPage.snap')}
          description={t('displayPage.snapHint')}
        >
          <Switch
            checked={display.snapping}
            onChange={(e) => patch({ snapping: e.target.checked })}
          />
        </Row>
        <Row
          id="display.shadows"
          label={t('displayPage.shadows')}
          description={t('displayPage.shadowsHint')}
        >
          <Switch
            checked={display.shadows}
            onChange={(e) => patch({ shadows: e.target.checked })}
          />
        </Row>
        <Row
          id="display.overlay"
          label={t('displayPage.overlay')}
          description={t('displayPage.overlayHint')}
        >
          <Switch
            checked={display.performanceOverlay}
            onChange={(e) => patch({ performanceOverlay: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('displayPage.titleTiling')}>
        <Row
          id="display.tilingGap"
          label={t('displayPage.gap')}
          description={t('displayPage.gapHint')}
          stacked
        >
          <Slider
            aria-label={t('displayPage.gap')}
            min={0}
            max={32}
            step={2}
            value={windows.tilingGap}
            onChange={(tilingGap) => patchWindows({ tilingGap })}
            showValue={pixelLabel}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('displayPage.titleFullScreen')}>
        <Row
          id="display.fullscreenCoversPanels"
          htmlFor="windows-fullscreen-covers-panels"
          label={t('displayPage.coverPanels')}
          description={t('displayPage.coverPanelsHint')}
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
          label={t('displayPage.hideTitleBar')}
          description={t('displayPage.hideTitleBarHint')}
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
          label={t('displayPage.slideMenubar')}
          description={t('displayPage.slideMenubarHint')}
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
          label={t('displayPage.slideTaskbar')}
          description={t('displayPage.slideTaskbarHint')}
        >
          <Switch
            id="windows-immersive-taskbar"
            checked={windows.immersiveTaskbar}
            disabled={!windows.fullscreenCoversPanels}
            onChange={(e) => patchWindows({ immersiveTaskbar: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('displayPage.titleViewport')}>
        <Row
          id="display.viewport"
          label={t('displayPage.viewport')}
          description={t('displayPage.viewportHint')}
        >
          <Value>{viewportLabel(vp.width, vp.height, vp.dpr)}</Value>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

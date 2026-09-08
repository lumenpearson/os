import type { MinimizeAnimation, Translate } from '@lumen/kernel';
import { useSetting, useT } from '@lumen/kernel/react';
import {
  SegmentedControl,
  type SegmentedOption,
  SettingsGroup,
  SettingsPage,
  Slider,
  Switch,
} from '@lumen/ui';
import { speedLabel } from '../logic';
import { Row } from '../Row';

/*
 * A function of the translator rather than a table built once at import: a
 * table would be filled in whatever language the settings happened to hold
 * when the module first loaded, and would keep those words after the language
 * changed. Called during render, it follows.
 */
const minimizeOptions = (t: Translate): SegmentedOption<MinimizeAnimation>[] => [
  { value: 'scale', label: t('option.scale') },
  { value: 'slide', label: t('option.slide') },
  { value: 'fade', label: t('option.fade') },
  { value: 'none', label: t('option.none') },
];

export function AnimationPage() {
  const t = useT();
  const [animation, patch] = useSetting('animation');
  return (
    <SettingsPage title={t('settings.animation')} description={t('animationPage.intro')}>
      <SettingsGroup title={t('animationPage.titleSpeed')}>
        <Row
          id="animation.speed"
          label={t('animationPage.speed')}
          description={t('animationPage.speedHint')}
          stacked
        >
          <Slider
            aria-label={t('animationPage.speed')}
            min={0}
            max={1.5}
            step={0.05}
            value={animation.speed}
            onChange={(speed) => patch({ speed })}
            showValue={speedLabel}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('animationPage.titleWindows')}>
        <Row
          id="animation.windows"
          htmlFor="animation-windows"
          label={t('animationPage.openClose')}
          description={t('animationPage.openCloseHint')}
        >
          <Switch
            id="animation-windows"
            checked={animation.windows}
            onChange={(e) => patch({ windows: e.target.checked })}
          />
        </Row>
        <Row
          id="animation.minimize"
          label={t('animationPage.minimise')}
          description={t('animationPage.minimiseHint')}
        >
          <SegmentedControl
            aria-label={t('animationPage.minimise')}
            options={minimizeOptions(t)}
            value={animation.minimize}
            onChange={(minimize) => patch({ minimize })}
          />
        </Row>
        <Row
          id="animation.windowMove"
          htmlFor="animation-window-move"
          label={t('animationPage.smoothDrag')}
          description={t('animationPage.smoothDragHint')}
        >
          <Switch
            id="animation-window-move"
            checked={animation.windowMove}
            onChange={(e) => patch({ windowMove: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('animationPage.titleInterface')}>
        <Row
          id="animation.menus"
          htmlFor="animation-menus"
          label={t('animationPage.menus')}
          description={t('animationPage.menusHint')}
        >
          <Switch
            id="animation-menus"
            checked={animation.menus}
            onChange={(e) => patch({ menus: e.target.checked })}
          />
        </Row>
        <Row
          id="animation.dialogs"
          htmlFor="animation-dialogs"
          label={t('animationPage.dialogs')}
          description={t('animationPage.dialogsHint')}
        >
          <Switch
            id="animation-dialogs"
            checked={animation.dialogs}
            onChange={(e) => patch({ dialogs: e.target.checked })}
          />
        </Row>
        <Row
          id="animation.panels"
          htmlFor="animation-panels"
          label={t('animationPage.panels')}
          description={t('animationPage.panelsHint')}
        >
          <Switch
            id="animation-panels"
            checked={animation.panels}
            onChange={(e) => patch({ panels: e.target.checked })}
          />
        </Row>
        <Row
          id="animation.pages"
          htmlFor="animation-pages"
          label={t('animationPage.pages')}
          description={t('animationPage.pagesHint')}
        >
          <Switch
            id="animation-pages"
            checked={animation.pages}
            onChange={(e) => patch({ pages: e.target.checked })}
          />
        </Row>
        <Row
          id="animation.press"
          htmlFor="animation-press"
          label={t('animationPage.press')}
          description={t('animationPage.pressHint')}
        >
          <Switch
            id="animation-press"
            checked={animation.press}
            onChange={(e) => patch({ press: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

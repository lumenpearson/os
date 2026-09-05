import type { MinimizeAnimation } from '@lumen/kernel';
import { useSetting } from '@lumen/kernel/react';
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

const MINIMIZE: SegmentedOption<MinimizeAnimation>[] = [
  { value: 'scale', label: 'Scale' },
  { value: 'slide', label: 'Slide' },
  { value: 'fade', label: 'Fade' },
  { value: 'none', label: 'None' },
];

export function AnimationPage() {
  const [animation, patch] = useSetting('animation');
  return (
    <SettingsPage
      title="Animation"
      description="How fast the interface moves, and which parts of it move at all."
    >
      <SettingsGroup title="Speed">
        <Row
          id="animation.speed"
          label="Animation speed"
          description="Multiplies every duration. At Off nothing below animates."
          stacked
        >
          <Slider
            aria-label="Animation speed"
            min={0}
            max={1.5}
            step={0.05}
            value={animation.speed}
            onChange={(speed) => patch({ speed })}
            showValue={speedLabel}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Windows">
        <Row
          id="animation.windows"
          htmlFor="animation-windows"
          label="Open and close"
          description="A window scales in when it opens and out when it closes."
        >
          <Switch
            id="animation-windows"
            checked={animation.windows}
            onChange={(e) => patch({ windows: e.target.checked })}
          />
        </Row>
        <Row
          id="animation.minimize"
          label="Minimise"
          description="How a window leaves for the taskbar."
        >
          <SegmentedControl
            aria-label="Minimise"
            options={MINIMIZE}
            value={animation.minimize}
            onChange={(minimize) => patch({ minimize })}
          />
        </Row>
        <Row
          id="animation.windowMove"
          htmlFor="animation-window-move"
          label="Smooth a window while it is dragged"
          description="Off: the window goes where the pointer goes, with nothing in between."
        >
          <Switch
            id="animation-window-move"
            checked={animation.windowMove}
            onChange={(e) => patch({ windowMove: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Interface">
        <Row
          id="animation.menus"
          htmlFor="animation-menus"
          label="Menus"
          description="Menus, popovers and the start menu as they open."
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
          label="Dialogs"
          description="Sheets, alerts and prompts."
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
          label="Panels"
          description="The taskbar, the system bar and the control centre."
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
          label="Pages"
          description="Moving between views inside an app."
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
          label="Press"
          description="The cursor's answer to a left or right click."
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

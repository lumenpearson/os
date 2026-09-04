import { useSetting } from '@lumen/kernel/react';
import { accents } from '@lumen/tokens';
import {
  cx,
  SegmentedControl,
  type SegmentedOption,
  SettingsGroup,
  SettingsPage,
  Slider,
  Switch,
} from '@lumen/ui';
import { percentLabel } from '../logic';
import { ChoiceGroup, Row } from '../Row';

type ThemeMode = 'light' | 'dark' | 'auto';

/** Mirrors the neutral ramp in @lumen/tokens theme.css; swatches must show both schemes at once. */
const SCHEME = {
  light: {
    canvas: '#f4f4f5',
    surface: '#ffffff',
    chrome: '#ececee',
    rule: 'rgb(0 0 0 / 0.12)',
    ink: '#141517',
  },
  dark: {
    canvas: '#1b1c1f',
    surface: '#232428',
    chrome: '#2b2c31',
    rule: 'rgb(255 255 255 / 0.12)',
    ink: '#ececee',
  },
} as const;

function MiniWindow({ scheme }: { scheme: 'light' | 'dark' }) {
  const c = SCHEME[scheme];
  return (
    <div className="absolute inset-0" style={{ background: c.canvas }}>
      <div
        className="absolute left-3 top-3 right-3 bottom-2 overflow-hidden rounded-[3px]"
        style={{
          background: c.surface,
          boxShadow: `0 0 0 1px ${c.rule}, 0 1px 2px rgb(0 0 0 / 0.12)`,
        }}
      >
        <div className="h-2" style={{ background: c.chrome }} />
        <div
          className="mt-1.5 ml-1.5 h-1 w-8 rounded-[1px]"
          style={{ background: c.ink, opacity: 0.6 }}
        />
        <div
          className="mt-1 ml-1.5 h-1 w-12 rounded-[1px]"
          style={{ background: c.ink, opacity: 0.25 }}
        />
        <div
          className="mt-1 ml-1.5 h-1 w-10 rounded-[1px]"
          style={{ background: c.ink, opacity: 0.25 }}
        />
      </div>
    </div>
  );
}

function ThemeSwatch({ mode, selected }: { mode: ThemeMode; selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'relative block h-16 w-24 overflow-hidden rounded-sm border border-rule-strong',
        selected && 'outline-2 outline-accent outline-offset-2',
      )}
    >
      {mode === 'auto' ? (
        <>
          <span className="absolute inset-0" style={{ clipPath: 'inset(0 50% 0 0)' }}>
            <MiniWindow scheme="light" />
          </span>
          <span className="absolute inset-0" style={{ clipPath: 'inset(0 0 0 50%)' }}>
            <MiniWindow scheme="dark" />
          </span>
        </>
      ) : (
        <MiniWindow scheme={mode} />
      )}
    </span>
  );
}

const THEMES: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
];

const CONTRAST: SegmentedOption<'normal' | 'high'>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

export function AppearancePage() {
  const [appearance, patch] = useSetting('appearance');
  return (
    <SettingsPage title="Appearance" description="Theme, accent colour, contrast and type size.">
      <SettingsGroup title="Theme">
        <Row
          id="appearance.theme"
          label="Theme"
          description="Auto follows the system setting."
          stacked
        >
          <ChoiceGroup
            label="Theme"
            value={appearance.theme}
            onChange={(theme) => patch({ theme })}
            options={THEMES.map((t) => ({
              value: t.value,
              label: t.label,
              render: (selected) => <ThemeSwatch mode={t.value} selected={selected} />,
            }))}
          />
        </Row>
        <Row
          id="appearance.accent"
          label="Accent colour"
          description="Selection, focus and the active state."
        >
          <ChoiceGroup
            label="Accent colour"
            labelHidden
            value={appearance.accent}
            onChange={(accent) => patch({ accent })}
            className="gap-1"
            options={accents.map((a) => ({
              value: a.id,
              label: a.label,
              render: (selected) => (
                <span
                  aria-hidden
                  className={cx(
                    'block size-[22px] rounded-full', // deslop-ignore 19 a colour swatch is a dot, not a surface
                    selected && 'outline-2 outline-ink outline-offset-2',
                  )}
                  style={{ background: `hsl(${a.h} ${a.s}% ${a.l}%)` }}
                />
              ),
            }))}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Accessibility">
        <Row
          id="appearance.contrast"
          label="Contrast"
          description="High contrast darkens secondary text and rules."
        >
          <SegmentedControl
            aria-label="Contrast"
            options={CONTRAST}
            value={appearance.contrast}
            onChange={(contrast) => patch({ contrast })}
          />
        </Row>
        <Row
          id="appearance.motion"
          label="Reduce motion"
          description="Windows and menus appear without animation."
        >
          <Switch
            checked={appearance.reduceMotion}
            onChange={(e) => patch({ reduceMotion: e.target.checked })}
          />
        </Row>
        <Row
          id="appearance.transparency"
          label="Reduce transparency"
          description="Solid menus and chrome instead of blur."
        >
          <Switch
            checked={appearance.reduceTransparency}
            onChange={(e) => patch({ reduceTransparency: e.target.checked })}
          />
        </Row>
        <Row id="appearance.fontScale" label="Font size" stacked>
          <Slider
            aria-label="Font size"
            min={0.9}
            max={1.3}
            step={0.05}
            value={appearance.fontScale}
            onChange={(fontScale) => patch({ fontScale })}
            showValue={percentLabel}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

import type { Translate } from '@lumen/kernel';
import { useSetting, useT } from '@lumen/kernel/react';
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
import { percentLabel, pixelLabel } from '../logic';
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

/*
 * A function of the translator rather than a table built once at import: a
 * table would be filled in whatever language the settings happened to hold
 * when the module first loaded, and would keep those words after the language
 * changed. Called during render, it follows.
 */
const themeOptions = (t: Translate): Array<{ value: ThemeMode; label: string }> => [
  { value: 'light', label: t('option.light') },
  { value: 'dark', label: t('option.dark') },
  { value: 'auto', label: t('option.auto') },
];

const contrastOptions = (t: Translate): SegmentedOption<'normal' | 'high'>[] => [
  { value: 'normal', label: t('option.normal') },
  { value: 'high', label: t('option.high') },
];

export function AppearancePage() {
  const t = useT();
  const [appearance, patch] = useSetting('appearance');
  return (
    <SettingsPage title={t('settings.appearance')} description={t('appearancePage.intro')}>
      <SettingsGroup title={t('appearancePage.titleTheme')}>
        <Row
          id="appearance.theme"
          label={t('appearancePage.titleTheme')}
          description={t('appearancePage.themeHint')}
          stacked
        >
          <ChoiceGroup
            label={t('appearancePage.titleTheme')}
            value={appearance.theme}
            onChange={(theme) => patch({ theme })}
            options={themeOptions(t).map((t) => ({
              value: t.value,
              label: t.label,
              render: (selected) => <ThemeSwatch mode={t.value} selected={selected} />,
            }))}
          />
        </Row>
        <Row
          id="appearance.accent"
          label={t('appearancePage.accent')}
          description={t('appearancePage.accentHint')}
        >
          <ChoiceGroup
            label={t('appearancePage.accent')}
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

      <SettingsGroup title={t('appearancePage.titleAccessibility')}>
        <Row
          id="appearance.contrast"
          label={t('appearancePage.contrast')}
          description={t('appearancePage.contrastHint')}
        >
          <SegmentedControl
            aria-label={t('appearancePage.contrast')}
            options={contrastOptions(t)}
            value={appearance.contrast}
            onChange={(contrast) => patch({ contrast })}
          />
        </Row>
        <Row
          id="appearance.motion"
          label={t('appearancePage.reduceMotion')}
          description={t('appearancePage.reduceMotionHint')}
        >
          <Switch
            checked={appearance.reduceMotion}
            onChange={(e) => patch({ reduceMotion: e.target.checked })}
          />
        </Row>
        <Row
          id="appearance.transparency"
          htmlFor="appearance-transparency"
          label={t('appearancePage.reduceTransparency')}
          description={t('appearancePage.reduceTransparencyHint')}
        >
          <Switch
            id="appearance-transparency"
            checked={appearance.reduceTransparency}
            onChange={(e) => patch({ reduceTransparency: e.target.checked })}
          />
        </Row>
        <Row
          id="appearance.blur"
          label={t('appearancePage.blur')}
          description={t('appearancePage.blurHint')}
          stacked
        >
          <Slider
            aria-label={t('appearancePage.blur')}
            min={0}
            max={40}
            step={1}
            value={appearance.blur}
            onChange={(blur) => patch({ blur })}
            disabled={appearance.reduceTransparency}
            showValue={pixelLabel}
          />
        </Row>
        <Row id="appearance.fontScale" label={t('appearancePage.fontSize')} stacked>
          <Slider
            aria-label={t('appearancePage.fontSize')}
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

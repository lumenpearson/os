import { useSetting } from '@lumen/kernel/react';
import {
  SegmentedControl,
  type SegmentedOption,
  SettingsGroup,
  SettingsPage,
  Slider,
  Switch,
} from '@lumen/ui';
import { Row } from '../Row';

type CursorStyle = 'lumen' | 'classic' | 'native';

const ARROWS: Record<CursorStyle, string> = {
  lumen: 'M3 1.5v12l3.2-2.9 2.2 4.4 2.2-1-2.2-4.3 4.1-.2z',
  classic: 'M3 1v11.5l2.8-2.4 1.8 4.2 2-.9-1.8-4.1h3.7z',
  native: 'M3 1.5v12l3.2-2.9 2.2 4.4 2.2-1-2.2-4.3 4.1-.2z',
};

function Arrow({ style }: { style: CursorStyle }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d={ARROWS[style]}
        fill={style === 'native' ? 'none' : 'currentColor'}
        stroke={style === 'native' ? 'currentColor' : 'var(--lumen-surface)'}
        strokeWidth={style === 'native' ? 1.2 : 1}
        strokeLinejoin={style === 'lumen' ? 'round' : 'miter'}
        strokeDasharray={style === 'native' ? '2 1.5' : undefined}
      />
    </svg>
  );
}

const STYLES: SegmentedOption<CursorStyle>[] = [
  { value: 'lumen', label: 'Lumen', icon: <Arrow style="lumen" /> },
  { value: 'classic', label: 'Classic', icon: <Arrow style="classic" /> },
  { value: 'native', label: 'Native', icon: <Arrow style="native" /> },
];

const COLORS: SegmentedOption<'auto' | 'light' | 'dark'>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function CursorPage() {
  const [cursor, patch] = useSetting('cursor');
  const custom = cursor.style !== 'native';
  return (
    <SettingsPage
      title="Cursor"
      description="The pointer the system draws. Native uses the host's own."
    >
      <SettingsGroup title="Pointer">
        <Row id="cursor.style" label="Style">
          <SegmentedControl
            aria-label="Cursor style"
            options={STYLES}
            value={cursor.style}
            onChange={(style) => patch({ style })}
          />
        </Row>
        <Row id="cursor.size" label="Size" stacked>
          <Slider
            aria-label="Cursor size"
            min={1}
            max={2}
            step={0.25}
            value={cursor.size}
            onChange={(size) => patch({ size })}
            disabled={!custom}
            showValue={(v) => `${v}×`}
          />
        </Row>
        <Row
          id="cursor.color"
          label="Colour"
          description="Auto picks light on dark wallpapers and dark on light ones."
        >
          <SegmentedControl
            aria-label="Cursor colour"
            options={COLORS}
            value={cursor.color}
            onChange={(color) => patch({ color })}
          />
        </Row>
        <Row id="cursor.trail" label="Trail" description="A short motion trail behind the pointer.">
          <Switch
            checked={cursor.trail}
            disabled={!custom}
            onChange={(e) => patch({ trail: e.target.checked })}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

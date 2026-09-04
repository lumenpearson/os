import { WALLPAPERS } from '@lumen/kernel';
import { useSetting } from '@lumen/kernel/react';
import {
  Button,
  cx,
  Select,
  type SelectOption,
  SettingsGroup,
  SettingsPage,
  Switch,
} from '@lumen/ui';
import { basename } from '@lumen/vfs';
import { FolderOpen } from 'lucide-react';
import { useFilePicker, useObjectUrl } from '../../_sdk';
import { ChoiceGroup, Row, Value } from '../Row';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

const FITS: SelectOption<'cover' | 'contain' | 'tile' | 'center'>[] = [
  { value: 'cover', label: 'Fill screen' },
  { value: 'contain', label: 'Fit to screen' },
  { value: 'tile', label: 'Tile' },
  { value: 'center', label: 'Centre' },
];

const ICON_SIZES: SelectOption<'small' | 'medium' | 'large'>[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const SORTS: SelectOption<'name' | 'kind' | 'date'>[] = [
  { value: 'name', label: 'Name' },
  { value: 'kind', label: 'Kind' },
  { value: 'date', label: 'Date modified' },
];

function Thumb({ src, alt, selected }: { src: string | null; alt: string; selected: boolean }) {
  return (
    <span
      className={cx(
        'block h-[100px] w-40 overflow-hidden rounded-md border border-rule bg-surface-2',
        selected && 'outline-2 outline-accent outline-offset-2',
      )}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          width={160}
          height={100}
          className="h-full w-full object-cover"
          draggable={false}
        />
      )}
    </span>
  );
}

function CustomThumb({ path, selected }: { path: string; selected: boolean }) {
  const { url } = useObjectUrl(path);
  return <Thumb src={url} alt={basename(path)} selected={selected} />;
}

export function WallpaperPage() {
  const [desktop, patch] = useSetting('desktop');
  const pick = useFilePicker();
  const custom = desktop.wallpaper.startsWith('preset:') ? null : desktop.wallpaper;

  const choose = async () => {
    const result = await pick({
      mode: 'open',
      title: 'Choose a wallpaper',
      extensions: IMAGE_EXTENSIONS,
    });
    const path = Array.isArray(result) ? result[0] : result;
    if (path) patch({ wallpaper: path });
  };

  const options = WALLPAPERS.map((w) => ({
    value: w.id,
    label: w.name,
    render: (selected: boolean) => (
      <Thumb
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(w.svg)}`}
        alt=""
        selected={selected}
      />
    ),
  }));
  if (custom) {
    options.push({
      value: custom,
      label: basename(custom),
      render: (selected: boolean) => <CustomThumb path={custom} selected={selected} />,
    });
  }

  return (
    <SettingsPage title="Wallpaper" description="The desktop picture and how icons sit on it.">
      <SettingsGroup title="Wallpaper">
        <Row id="wallpaper.picker" label="Picture" stacked>
          <ChoiceGroup
            label="Wallpaper"
            value={desktop.wallpaper}
            onChange={(wallpaper) => patch({ wallpaper })}
            options={options}
          />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              icon={<FolderOpen className="size-3.5" />}
              onClick={() => void choose()}
            >
              Choose from Files…
            </Button>
            {custom && <Value>{custom}</Value>}
          </div>
        </Row>
        <Row id="wallpaper.fit" label="Fit">
          <Select
            options={FITS}
            value={desktop.wallpaperFit}
            onChange={(wallpaperFit) => patch({ wallpaperFit })}
          />
        </Row>
        <Row
          id="wallpaper.dynamicChrome"
          label="Dynamic chrome"
          description="Tint the menubar and desktop from the wallpaper."
        >
          <Switch
            checked={desktop.dynamicChrome}
            onChange={(e) => patch({ dynamicChrome: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Desktop icons">
        <Row id="wallpaper.icons" label="Show desktop icons">
          <Switch
            checked={desktop.showIcons}
            onChange={(e) => patch({ showIcons: e.target.checked })}
          />
        </Row>
        <Row id="wallpaper.iconSize" label="Icon size">
          <Select
            options={ICON_SIZES}
            value={desktop.iconSize}
            onChange={(iconSize) => patch({ iconSize })}
            disabled={!desktop.showIcons}
          />
        </Row>
        <Row id="wallpaper.sortBy" label="Sort by">
          <Select
            options={SORTS}
            value={desktop.sortBy}
            onChange={(sortBy) => patch({ sortBy })}
            disabled={!desktop.showIcons}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

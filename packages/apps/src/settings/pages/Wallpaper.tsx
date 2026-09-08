import type { Translate } from '@lumen/kernel';
import { WALLPAPERS } from '@lumen/kernel';
import { useSetting, useT } from '@lumen/kernel/react';
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

/*
 * A function of the translator, not a table built at import: a table would
 * keep whatever language was in force when the module first loaded.
 */
const fitOptions = (t: Translate): SelectOption<'cover' | 'contain' | 'tile' | 'center'>[] => [
  { value: 'cover', label: t('wallpaperPage.fillScreen') },
  { value: 'contain', label: t('wallpaperPage.fitToScreen') },
  { value: 'tile', label: t('wallpaperPage.tile') },
  { value: 'center', label: t('wallpaperPage.centre') },
];

const iconSizeOptions = (t: Translate): SelectOption<'small' | 'medium' | 'large'>[] => [
  { value: 'small', label: t('desktop.sizeSmall') },
  { value: 'medium', label: t('desktop.sizeMedium') },
  { value: 'large', label: t('desktop.sizeLarge') },
];

const sortOptions = (t: Translate): SelectOption<'name' | 'kind' | 'date'>[] => [
  { value: 'name', label: t('desktop.sortName') },
  { value: 'kind', label: t('desktop.sortKind') },
  { value: 'date', label: t('wallpaperPage.dateModified') },
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
  const t = useT();
  const [desktop, patch] = useSetting('desktop');
  const pick = useFilePicker();
  const custom = desktop.wallpaper.startsWith('preset:') ? null : desktop.wallpaper;

  const choose = async () => {
    const result = await pick({
      mode: 'open',
      title: t('wallpaperPage.choose'),
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
        alt="" /* i18n-ignore a decorative preview; an empty alt is correct */
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
    <SettingsPage title={t('settings.wallpaper')} description={t('wallpaperPage.intro')}>
      <SettingsGroup title={t('settings.wallpaper')}>
        <Row id="wallpaper.picker" label={t('wallpaperPage.picture')} stacked>
          <ChoiceGroup
            label={t('settings.wallpaper')}
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
              {t('wallpaperPage.chooseFromFiles')}
            </Button>
            {custom && <Value>{custom}</Value>}
          </div>
        </Row>
        <Row id="wallpaper.fit" label={t('wallpaperPage.fit')}>
          <Select
            options={fitOptions(t)}
            value={desktop.wallpaperFit}
            onChange={(wallpaperFit) => patch({ wallpaperFit })}
          />
        </Row>
        <Row
          id="wallpaper.dynamicChrome"
          label={t('wallpaperPage.dynamicChrome')}
          description={t('wallpaperPage.dynamicChromeHint')}
        >
          <Switch
            checked={desktop.dynamicChrome}
            onChange={(e) => patch({ dynamicChrome: e.target.checked })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('wallpaperPage.desktopIcons')}>
        <Row id="wallpaper.icons" label={t('wallpaperPage.showIcons')}>
          <Switch
            checked={desktop.showIcons}
            onChange={(e) => patch({ showIcons: e.target.checked })}
          />
        </Row>
        <Row id="wallpaper.iconSize" label={t('wallpaperPage.iconSize')}>
          <Select
            options={iconSizeOptions(t)}
            value={desktop.iconSize}
            onChange={(iconSize) => patch({ iconSize })}
            disabled={!desktop.showIcons}
          />
        </Row>
        <Row id="wallpaper.sortBy" label={t('wallpaperPage.sortBy')}>
          <Select
            options={sortOptions(t)}
            value={desktop.sortBy}
            onChange={(sortBy) => patch({ sortBy })}
            disabled={!desktop.showIcons}
          />
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}

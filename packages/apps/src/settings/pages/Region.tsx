import { LANGUAGES, type Language } from '@lumen/kernel';
import { useClock, useSetting, useT } from '@lumen/kernel/react';
import {
  SegmentedControl,
  type SegmentedOption,
  Select,
  type SelectOption,
  SettingsGroup,
  SettingsPage,
} from '@lumen/ui';
import { useMemo } from 'react';
import { formatDate, formatTime } from '../../_sdk';
import { dateExample, LOCALES, listTimeZones, localeLabel } from '../logic';
import { Row, Value } from '../Row';

export function RegionPage() {
  const t = useT();
  const [region, patch] = useSetting('region');
  const now = useClock();

  /*
   * The option tables are built here rather than at module load: their labels
   * are text, and text now depends on which language is chosen — which is
   * itself one of the choices on this page. The list has to be able to redraw
   * in the language the person just picked.
   */
  const firstDay: SelectOption<'0' | '1'>[] = [
    { value: '1', label: t('region.monday') },
    { value: '0', label: t('region.sunday') },
  ];
  const dateFormats: SelectOption<'auto' | 'iso' | 'us' | 'eu'>[] = [
    { value: 'auto', label: t('region.dateFromLanguage') },
    { value: 'iso', label: t('region.dateIso') },
    { value: 'us', label: t('region.dateUs') },
    { value: 'eu', label: t('region.dateEuropean') },
  ];
  const temperature: SegmentedOption<'c' | 'f'>[] = [
    // i18n-ignore-next-line — the degree sign is the unit itself, the same in both languages
    { value: 'c', label: '°C' },
    // i18n-ignore-next-line — as above
    { value: 'f', label: '°F' },
  ];
  const measurement: SegmentedOption<'metric' | 'imperial'>[] = [
    { value: 'metric', label: t('region.metric') },
    { value: 'imperial', label: t('region.imperial') },
  ];

  /**
   * Only the languages with a dictionary behind them, plus `auto`. The region
   * list below offers fourteen tags because it formats dates for all of them;
   * offering fourteen interface languages and delivering two would be the
   * same broken promise this page used to make.
   */
  const languages: SelectOption<'auto' | Language>[] = [
    { value: 'auto', label: t('region.interfaceHint') },
    ...LANGUAGES.map((code) => ({
      value: code,
      label: new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code,
    })),
  ];
  const locales = useMemo<SelectOption[]>(() => {
    const list: string[] = LOCALES.includes(region.locale as (typeof LOCALES)[number])
      ? [...LOCALES]
      : [region.locale, ...LOCALES];
    return list.map((tag) => ({ value: tag, label: localeLabel(tag) }));
  }, [region.locale]);
  const zones = useMemo<SelectOption[]>(
    () => listTimeZones(region.timeZone).map((z) => ({ value: z, label: z.replace(/_/g, ' ') })),
    [region.timeZone],
  );

  return (
    <SettingsPage title={t('settings.region')} description={t('region.description')}>
      <SettingsGroup title={t('region.groupLanguage')}>
        <Row id="region.language" label={t('region.interfaceLanguage')}>
          <Select
            options={languages}
            value={region.language}
            onChange={(language) => patch({ language })}
          />
        </Row>
        <Row id="region.locale" label={t('region.formattingLocale')}>
          <Select
            options={locales}
            value={region.locale}
            onChange={(locale) => patch({ locale })}
          />
        </Row>
        <Row id="region.timeZone" label={t('region.timeZone')}>
          <Select
            options={zones}
            value={region.timeZone}
            onChange={(timeZone) => patch({ timeZone })}
            mono
            className="max-w-64"
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('region.groupFormats')}>
        <Row id="region.firstDay" label={t('region.firstDay')}>
          <Select
            options={firstDay}
            value={region.firstDayOfWeek === 0 ? '0' : '1'}
            onChange={(v) => patch({ firstDayOfWeek: v === '0' ? 0 : 1 })}
          />
        </Row>
        <Row id="region.dateFormat" label={t('region.dateFormat')}>
          <Value>{dateExample(region.dateFormat, region.locale, now)}</Value>
          <Select
            options={dateFormats}
            value={region.dateFormat}
            onChange={(dateFormat) => patch({ dateFormat })}
          />
        </Row>
        <Row id="region.temperature" label={t('region.temperature')}>
          <SegmentedControl
            aria-label={t('region.temperature')}
            options={temperature}
            value={region.temperature}
            onChange={(temperature) => patch({ temperature })}
          />
        </Row>
        <Row id="region.measurement" label={t('region.measurement')}>
          <SegmentedControl
            aria-label={t('region.measurement')}
            options={measurement}
            value={region.measurement}
            onChange={(measurement) => patch({ measurement })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('region.groupPreview')}>
        <Row
          id="region.preview"
          label={t('region.today', {
            date: formatDate(now, 'long'),
            time: formatTime(now, { seconds: true }),
          })}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

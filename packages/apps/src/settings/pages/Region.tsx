import { useClock, useSetting } from '@lumen/kernel/react';
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

const FIRST_DAY: SelectOption<'0' | '1'>[] = [
  { value: '1', label: 'Monday' },
  { value: '0', label: 'Sunday' },
];

const DATE_FORMATS: SelectOption<'auto' | 'iso' | 'us' | 'eu'>[] = [
  { value: 'auto', label: 'From language' },
  { value: 'iso', label: 'ISO 8601' },
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'European' },
];

const TEMPERATURE: SegmentedOption<'c' | 'f'>[] = [
  { value: 'c', label: '°C' },
  { value: 'f', label: '°F' },
];

const MEASUREMENT: SegmentedOption<'metric' | 'imperial'>[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
];

export function RegionPage() {
  const [region, patch] = useSetting('region');
  const now = useClock();
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
    <SettingsPage
      title="Language & Region"
      description="Language, time zone and how dates and units are written."
    >
      <SettingsGroup title="Language">
        <Row id="region.locale" label="Language">
          <Select
            options={locales}
            value={region.locale}
            onChange={(locale) => patch({ locale })}
          />
        </Row>
        <Row id="region.timeZone" label="Time zone">
          <Select
            options={zones}
            value={region.timeZone}
            onChange={(timeZone) => patch({ timeZone })}
            mono
            className="max-w-64"
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Formats">
        <Row id="region.firstDay" label="First day of week">
          <Select
            options={FIRST_DAY}
            value={region.firstDayOfWeek === 0 ? '0' : '1'}
            onChange={(v) => patch({ firstDayOfWeek: v === '0' ? 0 : 1 })}
          />
        </Row>
        <Row id="region.dateFormat" label="Date format">
          <Value>{dateExample(region.dateFormat, region.locale, now)}</Value>
          <Select
            options={DATE_FORMATS}
            value={region.dateFormat}
            onChange={(dateFormat) => patch({ dateFormat })}
          />
        </Row>
        <Row id="region.temperature" label="Temperature">
          <SegmentedControl
            aria-label="Temperature"
            options={TEMPERATURE}
            value={region.temperature}
            onChange={(temperature) => patch({ temperature })}
          />
        </Row>
        <Row id="region.measurement" label="Measurement">
          <SegmentedControl
            aria-label="Measurement"
            options={MEASUREMENT}
            value={region.measurement}
            onChange={(measurement) => patch({ measurement })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Preview">
        <Row
          id="region.preview"
          label={`Today is ${formatDate(now, 'long')} ${formatTime(now, { seconds: true })}`}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

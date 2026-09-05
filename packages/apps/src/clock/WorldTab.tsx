/**
 * The world list. Each row answers the three questions a second zone raises —
 * what time is it there, how far is that from here, and is it still the same
 * day — and the time itself is written by the frame loop, so twenty cities
 * tick without a single re-render.
 */

import { EmptyState, IconButton } from '@lumen/ui';
import { ChevronDown, ChevronUp, Globe, X } from 'lucide-react';
import { useMemo } from 'react';
import { useWallClock } from './frames';
import { ZONE_LIMIT } from './storage';
import { Ticking } from './Ticking';
import { ZoneCombobox } from './ZoneCombobox';
import {
  dayDifference,
  dayLabel,
  formatOffsetDifference,
  formatZoneTime,
  listTimeZones,
  offsetDifference,
  zoneLabel,
  zoneRegion,
} from './zones';

export interface WorldTabProps {
  zones: readonly string[];
  /** The zone everything is compared against. */
  home: string;
  locale: string;
  hour12: boolean;
  onAdd: (zone: string) => void;
  onRemove: (zone: string) => void;
  onMove: (from: number, to: number) => void;
}

export function WorldTab({ zones, home, locale, hour12, onAdd, onRemove, onMove }: WorldTabProps) {
  // The offsets and the day only change on the hour or at a daylight-saving
  // boundary; half a minute is a fine resolution for both.
  const at = useWallClock(30_000);
  const all = useMemo(() => listTimeZones(), []);
  const offered = useMemo(() => all.filter((zone) => !zones.includes(zone)), [all, zones]);
  const full = zones.length >= ZONE_LIMIT;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="shrink-0 border-b border-rule p-2">
        <ZoneCombobox
          zones={offered}
          at={at}
          onSelect={onAdd}
          disabled={full}
          placeholder={full ? `The list holds ${ZONE_LIMIT} cities` : 'Add a city'}
        />
      </div>

      {zones.length === 0 ? (
        <EmptyState
          icon={<Globe />}
          title="No cities yet"
          description="Search above to add one. Each shows its time, how far it is from yours, and whether it is still the same day."
        />
      ) : (
        <ul className="lumen-scroll min-h-0 flex-1">
          {zones.map((zone, index) => {
            const difference = offsetDifference(zone, home, at);
            const day = dayDifference(zone, home, at);
            const region = zoneRegion(zone);
            return (
              <li
                key={zone}
                className="flex items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate-1 text-md text-ink">{zoneLabel(zone)}</span>
                  <span className="truncate-1 text-sm text-ink-2">
                    {dayLabel(day)} · {formatOffsetDifference(difference)}
                    {region ? ` · ${region}` : ''}
                  </span>
                </div>
                <Ticking
                  read={() => formatZoneTime(zone, Date.now(), { locale, hour12 })}
                  className="mono shrink-0 text-lg text-ink"
                />
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={`Move ${zoneLabel(zone)} up`}
                    size="sm"
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1)}
                  >
                    <ChevronUp />
                  </IconButton>
                  <IconButton
                    label={`Move ${zoneLabel(zone)} down`}
                    size="sm"
                    disabled={index === zones.length - 1}
                    onClick={() => onMove(index, index + 1)}
                  >
                    <ChevronDown />
                  </IconButton>
                  <IconButton
                    label={`Remove ${zoneLabel(zone)}`}
                    size="sm"
                    onClick={() => onRemove(zone)}
                  >
                    <X />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

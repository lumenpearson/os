/**
 * The local clock: the time as large as the window allows, the date under it,
 * and the zone it is all read in. The digits are sized with `clamp()` against
 * the panel's own width, so the reading stays whole from a 300 px window to a
 * maximised one without a resize handler.
 */

import { type CSSProperties, useState } from 'react';
import { formatDate } from '../_sdk';
import { AnalogueFace } from './AnalogueFace';
import { useFrames } from './frames';
import type { Face } from './storage';
import { Ticking } from './Ticking';
import { clockParts, dayNumber, formatOffset, offsetMinutes, zoneLabel } from './zones';

/** The same length on both axes, so the face stays round in any window shape. */
const FACE_SIZE: CSSProperties = {
  width: 'min(78cqw, 62cqh, 320px)',
  height: 'min(78cqw, 62cqh, 320px)',
};

const DIGITS: CSSProperties = { fontSize: 'clamp(2rem, 18cqw, 8rem)' };
const DAY_PERIOD: CSSProperties = { fontSize: 'clamp(0.75rem, 4cqw, 1.5rem)' };

export interface ClockTabProps {
  face: Face;
  timeZone: string;
  locale: string;
  hour12: boolean;
}

export function ClockTab({ face, timeZone, locale, hour12 }: ClockTabProps) {
  // The date is not a ticking value: it is re-read only when the day it names
  // has actually turned over, which the frames below notice for free.
  const [day, setDay] = useState(() => dayNumber(timeZone, Date.now()));
  useFrames(true, () => {
    const today = dayNumber(timeZone, Date.now());
    if (today !== day) setDay(today);
  });

  const at = Date.now();
  const suffix = clockParts(timeZone, at, { locale, hour12, seconds: true }).suffix;
  const offset = formatOffset(offsetMinutes(timeZone, at));

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-5 p-4"
      // Container queries, so the reading is sized by the window and not by the
      // screen; `contain: size` is safe here because flex gives this box its
      // height from above.
      style={{ containerType: 'size' }}
    >
      {face === 'analogue' ? (
        <AnalogueFace timeZone={timeZone} className="shrink-0" style={FACE_SIZE} />
      ) : (
        <p className="flex w-full items-baseline justify-center gap-2 text-ink">
          <Ticking
            read={() => clockParts(timeZone, Date.now(), { locale, hour12, seconds: true }).time}
            className="mono font-medium leading-none tracking-tight"
            style={DIGITS}
          />
          {suffix && (
            <span className="mono text-ink-2" style={DAY_PERIOD}>
              {suffix}
            </span>
          )}
        </p>
      )}

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-md text-ink-2">{formatDate(at, 'long')}</p>
        <p className="mono text-xs text-ink-3">
          {zoneLabel(timeZone)} · UTC{offset}
        </p>
      </div>
    </div>
  );
}

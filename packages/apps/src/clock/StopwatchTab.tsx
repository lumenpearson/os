/**
 * The stopwatch. The reading and the lap in progress are written by the frame
 * loop; the finished laps are ordinary React rows, because they only change
 * when a button is pressed.
 */

import { Button, Label } from '@lumen/ui';
import { type CSSProperties, useMemo } from 'react';
import { formatDelta, formatStopwatch } from './duration';
import { now } from './frames';
import {
  completedLaps,
  currentLap,
  elapsed,
  isIdle,
  isRunning,
  lapExtremes,
  type StopwatchState,
} from './stopwatch';
import { Ticking } from './Ticking';

const READOUT: CSSProperties = { fontSize: 'clamp(2rem, 15cqw, 5rem)' };

export interface StopwatchTabProps {
  state: StopwatchState;
  onToggle: () => void;
  onLap: () => void;
  onReset: () => void;
}

export function StopwatchTab({ state, onToggle, onLap, onReset }: StopwatchTabProps) {
  const running = isRunning(state);
  const idle = isIdle(state);
  const laps = useMemo(() => completedLaps(state), [state]);
  const extremes = useMemo(() => lapExtremes(laps), [laps]);
  // Only the number of the open lap is rendered; its two times are written by
  // the frames below, and stay on screen frozen when the watch is stopped.
  const openLap = currentLap(state, now()).number;

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="flex shrink-0 flex-col items-center gap-4 p-4"
        style={{ containerType: 'inline-size' }}
      >
        <Ticking
          read={() => formatStopwatch(elapsed(state, now()))}
          active={running}
          className="mono font-medium leading-none tracking-tight text-ink"
          style={READOUT}
        />
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            className="min-w-24"
            disabled={running ? false : idle}
            onClick={running ? onLap : onReset}
          >
            {running ? 'Lap' : 'Reset'}
          </Button>
          <Button variant="primary" size="lg" className="min-w-24" onClick={onToggle}>
            {running ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>

      {(laps.length > 0 || running) && (
        <div className="lumen-scroll min-h-0 flex-1 border-t border-rule">
          <table className="w-full">
            <caption className="sr-only">Laps, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-1 text-left font-normal">
                  <Label>Lap</Label>
                </th>
                <th scope="col" className="px-3 py-1 text-right font-normal">
                  <Label>Lap time</Label>
                </th>
                <th scope="col" className="px-3 py-1 text-right font-normal">
                  <Label>Total</Label>
                </th>
              </tr>
            </thead>
            <tbody>
              {(running || laps.length > 0) && (
                <tr className="border-t border-rule text-ink-2">
                  <th scope="row" className="px-3 py-1.5 text-left text-base font-normal">
                    {openLap}
                  </th>
                  <td className="mono px-3 py-1.5 text-right text-base">
                    <Ticking
                      active={running}
                      read={() => formatDelta(currentLap(state, now()).delta)}
                    />
                  </td>
                  <td className="mono px-3 py-1.5 text-right text-base">
                    <Ticking active={running} read={() => formatStopwatch(elapsed(state, now()))} />
                  </td>
                </tr>
              )}
              {laps.map((lap) => {
                const mark =
                  lap.number === extremes.fastest
                    ? 'fastest'
                    : lap.number === extremes.slowest
                      ? 'slowest'
                      : null;
                return (
                  <tr key={lap.number} className="border-t border-rule text-ink">
                    <th scope="row" className="px-3 py-1.5 text-left text-base font-normal">
                      <span className="flex items-baseline gap-2">
                        {lap.number}
                        {mark && <Label>{mark}</Label>}
                      </span>
                    </th>
                    <td className="mono px-3 py-1.5 text-right text-base tabular-nums">
                      {formatDelta(lap.delta)}
                    </td>
                    <td className="mono px-3 py-1.5 text-right text-base tabular-nums text-ink-2">
                      {formatStopwatch(lap.at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

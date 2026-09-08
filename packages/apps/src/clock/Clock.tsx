/**
 * The clock window: four views over one piece of state.
 *
 * The stopwatch and the countdown live here rather than in their tabs, so a
 * run survives a switch to the world list, and so the countdown can finish —
 * notification and chime — while another tab is on screen. Both are held as
 * timestamps and read by subtraction, which is why none of that costs
 * accuracy. What is kept between sessions goes to ~/.config/clock.json.
 */

import { useKernel, useSetting } from '@lumen/kernel/react';
import {
  IconButton,
  SegmentedControl,
  type SegmentedOption,
  Toolbar,
  ToolbarSpacer,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { Clock3, LayoutGrid } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useNotify, useTitle } from '../_sdk';
import { ClockTab } from './ClockTab';
import { playChime } from './chime';
import { describeDuration } from './duration';
import { now } from './frames';
import { buildClockMenus } from './menus';
import { StopwatchTab } from './StopwatchTab';
import {
  IDLE_STOPWATCH,
  lap as lapWatch,
  reset as resetWatch,
  type StopwatchState,
  toggle as toggleWatch,
  isIdle as watchIsIdle,
  isRunning as watchIsRunning,
} from './stopwatch';
import {
  addPreset,
  addZone,
  type ClockData,
  DEFAULT_DATA,
  type Face,
  moveZone,
  normalizeData,
  removePreset,
  removeZone,
  TAB_LABEL,
  TABS,
  type TabId,
} from './storage';
import { TimerTab } from './TimerTab';
import {
  armed,
  isIdle as countdownIsIdle,
  isRunning as countdownIsRunning,
  remaining,
  reset as resetCountdown,
  setDuration,
  settle,
  type TimerState,
  toggle as toggleCountdown,
} from './timer';
import { WorldTab } from './WorldTab';

const TAB_OPTIONS: ReadonlyArray<SegmentedOption<TabId>> = TABS.map((tab) => ({
  value: tab,
  label: TAB_LABEL[tab],
}));

/**
 * The gap between two checks of a countdown that has not finished yet. A
 * background window has its timers clamped to about a second, so the check is
 * rescheduled from the deadline rather than counted towards it.
 */
const RECHECK_MS = 16;

export default function Clock(_props: AppProps) {
  const kernel = useKernel();
  const [menubar, patchMenubar] = useSetting('menubar');
  const [region] = useSetting('region');
  const notify = useNotify();
  useTitle('Clock');

  const [stored, store, { loaded }] = useJsonFile<ClockData>(
    join(kernel.home, '.config', 'clock.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);
  const patch = (change: Partial<ClockData>) =>
    store((previous) => ({ ...normalizeData(previous), ...change }));

  const [watch, setWatch] = useState<StopwatchState>(IDLE_STOPWATCH);
  const [countdown, setCountdown] = useState<TimerState>(() => armed(DEFAULT_DATA.timer));

  const timeZone = region.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = region.locale || 'en-US';
  const hour12 = !menubar.clock24h;

  // The stored duration arrives after the first paint; take it up only while
  // the timer is untouched, so a countdown already running is never disturbed.
  useEffect(() => {
    if (!loaded) return;
    setCountdown((previous) =>
      countdownIsIdle(previous) && previous.duration !== data.timer ? armed(data.timer) : previous,
    );
  }, [loaded, data.timer]);

  // One wake-up per countdown, at the deadline. Whatever the browser does with
  // a background window's timers, the reading below is the one that decides.
  useEffect(() => {
    if (countdown.deadline === null) return;
    let handle: ReturnType<typeof setTimeout>;
    const check = () => {
      const outcome = settle(countdown, now());
      if (!outcome.completed) {
        handle = setTimeout(check, Math.max(RECHECK_MS, remaining(countdown, now())));
        return;
      }
      setCountdown(outcome.state);
      notify('Timer finished', `${describeDuration(countdown.duration)} is up.`);
      playChime();
    };
    handle = setTimeout(check, Math.max(RECHECK_MS, remaining(countdown, now())));
    return () => clearTimeout(handle);
  }, [countdown, notify]);

  const setTab = (tab: TabId) => patch({ tab });
  const setFace = (face: Face) => patch({ face });

  const setTimerDuration = (ms: number) => {
    setCountdown((previous) => setDuration(previous, ms));
    patch({ timer: ms });
  };

  useAppMenus(
    buildClockMenus(
      {
        tab: data.tab,
        face: data.face,
        clock24h: menubar.clock24h,
        stopwatchRunning: watchIsRunning(watch),
        stopwatchIdle: watchIsIdle(watch),
        timerRunning: countdownIsRunning(countdown),
        timerReady: countdown.duration > 0,
        timerIdle: countdownIsIdle(countdown),
      },
      {
        setTab,
        setFace,
        setClock24h: (on) => patchMenubar({ clock24h: on }),
        toggleStopwatch: () => setWatch((previous) => toggleWatch(previous, now())),
        lapStopwatch: () => setWatch((previous) => lapWatch(previous, now())),
        resetStopwatch: () => setWatch(resetWatch),
        toggleTimer: () => setCountdown((previous) => toggleCountdown(previous, now())),
        resetTimer: () => setCountdown(resetCountdown),
      },
    ),
    [data.tab, data.face, menubar.clock24h, watch, countdown],
  );

  return (
    <div className="flex h-full w-full flex-col bg-surface text-ink">
      <Toolbar dense>
        <SegmentedControl
          size="sm"
          aria-label="View"
          className="min-w-0"
          options={TAB_OPTIONS}
          value={data.tab}
          onChange={setTab}
        />
        <ToolbarSpacer />
        {data.tab === 'clock' && (
          <IconButton
            label={data.face === 'analogue' ? 'Show digits' : 'Show an analogue face'}
            size="sm"
            active={data.face === 'analogue'}
            onClick={() => setFace(data.face === 'analogue' ? 'digital' : 'analogue')}
          >
            {data.face === 'analogue' ? <LayoutGrid /> : <Clock3 />}
          </IconButton>
        )}
      </Toolbar>

      <div className="min-h-0 flex-1">
        {data.tab === 'clock' && (
          <ClockTab face={data.face} timeZone={timeZone} locale={locale} hour12={hour12} />
        )}
        {data.tab === 'world' && (
          <WorldTab
            zones={data.zones}
            home={timeZone}
            locale={locale}
            hour12={hour12}
            onAdd={(zone) => patch({ zones: addZone(data.zones, zone) })}
            onRemove={(zone) => patch({ zones: removeZone(data.zones, zone) })}
            onMove={(from, to) => patch({ zones: moveZone(data.zones, from, to) })}
          />
        )}
        {data.tab === 'stopwatch' && (
          <StopwatchTab
            state={watch}
            onToggle={() => setWatch((previous) => toggleWatch(previous, now()))}
            onLap={() => setWatch((previous) => lapWatch(previous, now()))}
            onReset={() => setWatch(resetWatch)}
          />
        )}
        {data.tab === 'timer' && (
          <TimerTab
            state={countdown}
            presets={data.presets}
            onSetDuration={setTimerDuration}
            onToggle={() => setCountdown((previous) => toggleCountdown(previous, now()))}
            onReset={() => setCountdown(resetCountdown)}
            onAddPreset={(ms) => patch({ presets: addPreset(data.presets, ms) })}
            onRemovePreset={(ms) => patch({ presets: removePreset(data.presets, ms) })}
          />
        )}
      </div>
    </div>
  );
}

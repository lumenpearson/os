/**
 * The menubar for the clock window, built from one snapshot of state so a
 * command does the same thing whether it is clicked or typed.
 *
 * Transport commands stay enabled whichever tab is up — a timer started from
 * the menu should start — but the chord for Start, Lap and Reset is attached
 * to the tab on screen, so the same three keys mean the stopwatch or the timer
 * depending on what is being looked at, and never both at once.
 */

import type { MenuItemTemplate, MenuTemplate } from '@lumen/kernel';
import { type Face, TAB_LABEL, TABS, type TabId } from './storage';

export interface ClockMenuState {
  tab: TabId;
  face: Face;
  clock24h: boolean;
  stopwatchRunning: boolean;
  /** The stopwatch has never been started, or has been reset. */
  stopwatchIdle: boolean;
  timerRunning: boolean;
  /** The timer is set to something it could count down. */
  timerReady: boolean;
  /** The timer is stopped at its full duration. */
  timerIdle: boolean;
}

export interface ClockMenuActions {
  setTab: (tab: TabId) => void;
  setFace: (face: Face) => void;
  setClock24h: (on: boolean) => void;
  toggleStopwatch: () => void;
  lapStopwatch: () => void;
  resetStopwatch: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
}

const separator: MenuItemTemplate = { type: 'separator' };

export function buildClockMenus(state: ClockMenuState, actions: ClockMenuActions): MenuTemplate[] {
  const on = (tab: TabId, keys: string) => (state.tab === tab ? keys : undefined);
  return [
    {
      id: 'view',
      label: 'View',
      items: [
        ...TABS.map((tab, index) => ({
          id: tab,
          type: 'radio' as const,
          label: TAB_LABEL[tab],
          shortcut: `Mod+${index + 1}`,
          checked: state.tab === tab,
          onSelect: () => actions.setTab(tab),
        })),
        separator,
        {
          id: 'digital',
          type: 'radio',
          label: 'Digital Face',
          checked: state.face === 'digital',
          onSelect: () => actions.setFace('digital'),
        },
        {
          id: 'analogue',
          type: 'radio',
          label: 'Analogue Face',
          checked: state.face === 'analogue',
          onSelect: () => actions.setFace('analogue'),
        },
        separator,
        {
          id: 'clock24h',
          type: 'checkbox',
          label: '24-Hour Clock',
          checked: state.clock24h,
          onSelect: () => actions.setClock24h(!state.clock24h),
        },
      ],
    },
    {
      id: 'stopwatch',
      label: 'Stopwatch',
      items: [
        {
          id: 'toggle',
          label: state.stopwatchRunning ? 'Stop' : 'Start',
          shortcut: on('stopwatch', 'Mod+Enter'),
          onSelect: actions.toggleStopwatch,
        },
        {
          id: 'lap',
          label: 'Lap',
          shortcut: on('stopwatch', 'Mod+L'),
          enabled: state.stopwatchRunning,
          onSelect: actions.lapStopwatch,
        },
        separator,
        {
          id: 'reset',
          label: 'Reset',
          shortcut: on('stopwatch', 'Mod+R'),
          enabled: !state.stopwatchIdle,
          onSelect: actions.resetStopwatch,
        },
      ],
    },
    {
      id: 'timer',
      label: 'Timer',
      items: [
        {
          id: 'toggle',
          label: state.timerRunning ? 'Pause' : 'Start',
          shortcut: on('timer', 'Mod+Enter'),
          enabled: state.timerRunning || state.timerReady,
          onSelect: actions.toggleTimer,
        },
        separator,
        {
          id: 'reset',
          label: 'Reset',
          shortcut: on('timer', 'Mod+R'),
          enabled: !state.timerIdle,
          onSelect: actions.resetTimer,
        },
      ],
    },
  ];
}

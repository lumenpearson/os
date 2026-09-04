import { findMenuShortcut, type MenuItemTemplate, type MenuTemplate } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import { buildClockMenus, type ClockMenuActions, type ClockMenuState } from './menus';

const state = (patch: Partial<ClockMenuState> = {}): ClockMenuState => ({
  tab: 'clock',
  face: 'digital',
  clock24h: false,
  stopwatchRunning: false,
  stopwatchIdle: true,
  timerRunning: false,
  timerReady: true,
  timerIdle: true,
  ...patch,
});

function actions(): ClockMenuActions & { calls: string[] } {
  const calls: string[] = [];
  const note =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length > 0 ? `${name}:${String(args[0])}` : name);
    };
  return {
    calls,
    setTab: note('setTab'),
    setFace: note('setFace'),
    setClock24h: note('setClock24h'),
    toggleStopwatch: note('toggleStopwatch'),
    lapStopwatch: note('lapStopwatch'),
    resetStopwatch: note('resetStopwatch'),
    toggleTimer: note('toggleTimer'),
    resetTimer: note('resetTimer'),
  };
}

function item(menus: MenuTemplate[], menu: string, id: string): MenuItemTemplate {
  const found = menus.find((m) => m.id === menu)?.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

/** A keydown as the SDK sees it. */
const chord = (key: string, mods: Partial<Record<'shiftKey' | 'altKey', boolean>> = {}) => ({
  key,
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('the View menu', () => {
  it('offers the four tabs on Mod+1 to Mod+4 and checks the one shown', () => {
    const menus = buildClockMenus(state({ tab: 'stopwatch' }), actions());
    const view = menus.find((m) => m.id === 'view');
    expect(view?.items.slice(0, 4).map((i) => [i.id, i.shortcut, i.checked])).toEqual([
      ['clock', 'Mod+1', false],
      ['world', 'Mod+2', false],
      ['stopwatch', 'Mod+3', true],
      ['timer', 'Mod+4', false],
    ]);
  });

  it('switches tab, face and clock format', () => {
    const acts = actions();
    const menus = buildClockMenus(state({ clock24h: true }), acts);
    item(menus, 'view', 'world').onSelect?.();
    item(menus, 'view', 'analogue').onSelect?.();
    item(menus, 'view', 'clock24h').onSelect?.();
    expect(acts.calls).toEqual(['setTab:world', 'setFace:analogue', 'setClock24h:false']);
  });

  it('shows which face is drawn', () => {
    const menus = buildClockMenus(state({ face: 'analogue' }), actions());
    expect(item(menus, 'view', 'analogue').checked).toBe(true);
    expect(item(menus, 'view', 'digital').checked).toBe(false);
  });
});

describe('the transport menus', () => {
  it('names the command by what it will do', () => {
    const stopped = buildClockMenus(state(), actions());
    expect(item(stopped, 'stopwatch', 'toggle').label).toBe('Start');
    expect(item(stopped, 'timer', 'toggle').label).toBe('Start');
    const going = buildClockMenus(state({ stopwatchRunning: true, timerRunning: true }), actions());
    expect(item(going, 'stopwatch', 'toggle').label).toBe('Stop');
    expect(item(going, 'timer', 'toggle').label).toBe('Pause');
  });

  it('offers Lap only while the stopwatch runs', () => {
    expect(item(buildClockMenus(state(), actions()), 'stopwatch', 'lap').enabled).toBe(false);
    expect(
      item(buildClockMenus(state({ stopwatchRunning: true }), actions()), 'stopwatch', 'lap')
        .enabled,
    ).toBe(true);
  });

  it('offers Reset only when there is something to reset', () => {
    const fresh = buildClockMenus(state(), actions());
    expect(item(fresh, 'stopwatch', 'reset').enabled).toBe(false);
    expect(item(fresh, 'timer', 'reset').enabled).toBe(false);
    const used = buildClockMenus(state({ stopwatchIdle: false, timerIdle: false }), actions());
    expect(item(used, 'stopwatch', 'reset').enabled).toBe(true);
    expect(item(used, 'timer', 'reset').enabled).toBe(true);
  });

  it('will not start a timer that is set to nothing', () => {
    const menus = buildClockMenus(state({ timerReady: false }), actions());
    expect(item(menus, 'timer', 'toggle').enabled).toBe(false);
  });

  it('runs the command it names', () => {
    const acts = actions();
    const menus = buildClockMenus(state({ stopwatchRunning: true }), acts);
    item(menus, 'stopwatch', 'toggle').onSelect?.();
    item(menus, 'stopwatch', 'lap').onSelect?.();
    item(menus, 'stopwatch', 'reset').onSelect?.();
    item(menus, 'timer', 'toggle').onSelect?.();
    item(menus, 'timer', 'reset').onSelect?.();
    expect(acts.calls).toEqual([
      'toggleStopwatch',
      'lapStopwatch',
      'resetStopwatch',
      'toggleTimer',
      'resetTimer',
    ]);
  });
});

describe('the transport chords', () => {
  it('belong to the tab on screen, and to one command at a time', () => {
    const onStopwatch = buildClockMenus(state({ tab: 'stopwatch' }), actions());
    expect(findMenuShortcut(onStopwatch, chord('Enter'), 'ctrl')?.label).toBe('Start');
    expect(item(onStopwatch, 'timer', 'toggle').shortcut).toBeUndefined();

    const onTimer = buildClockMenus(state({ tab: 'timer' }), actions());
    expect(findMenuShortcut(onTimer, chord('Enter'), 'ctrl')?.label).toBe('Start');
    expect(item(onTimer, 'stopwatch', 'toggle').shortcut).toBeUndefined();
  });

  it('leaves the keys alone on the tabs that have no transport', () => {
    const menus = buildClockMenus(state({ tab: 'world' }), actions());
    expect(findMenuShortcut(menus, chord('Enter'), 'ctrl')).toBeNull();
    expect(findMenuShortcut(menus, chord('l'), 'ctrl')).toBeNull();
    expect(findMenuShortcut(menus, chord('r'), 'ctrl')).toBeNull();
  });

  it('runs the stopwatch commands the shortcuts point at', () => {
    const acts = actions();
    const menus = buildClockMenus(state({ tab: 'stopwatch', stopwatchRunning: true }), acts);
    findMenuShortcut(menus, chord('l'), 'ctrl')?.onSelect?.();
    expect(acts.calls).toEqual(['lapStopwatch']);
  });

  it('does not claim a chord for a command that is off', () => {
    const menus = buildClockMenus(state({ tab: 'stopwatch', stopwatchIdle: true }), actions());
    expect(findMenuShortcut(menus, chord('r'), 'ctrl')).toBeNull();
  });

  it('keeps the tab chords whichever tab is up', () => {
    const acts = actions();
    const menus = buildClockMenus(state({ tab: 'timer' }), acts);
    const found = findMenuShortcut(menus, chord('2'), 'ctrl');
    expect(found?.label).toBe('World');
    found?.onSelect?.();
    expect(acts.calls).toEqual(['setTab:world']);
  });
});

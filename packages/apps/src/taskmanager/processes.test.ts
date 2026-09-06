import type { Pid, Process, WindowId, WindowState } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import {
  buildProcessRows,
  endProcessMessage,
  nextSelection,
  type ProcessColumnId,
  type ProcessRow,
  processSignature,
  processSortValue,
  processState,
  windowSignature,
} from './processes';

const RECT = { x: 0, y: 0, width: 100, height: 100 };

function process(pid: Pid, over: Partial<Process> = {}): Process {
  return {
    pid,
    appId: 'lumen.editor',
    name: 'Text Editor',
    args: {},
    startedAt: 1_000,
    windowIds: [],
    cpu: 0,
    memory: 1024,
    background: false,
    ...over,
  };
}

function win(id: WindowId, pid: Pid, over: Partial<WindowState> = {}): WindowState {
  return {
    id,
    pid,
    appId: 'lumen.editor',
    title: 'Untitled',
    bounds: RECT,
    restoreBounds: null,
    preferredBounds: null,
    minimized: false,
    maximized: false,
    fullscreen: false,
    snap: null,
    zIndex: 100,
    options: { width: 100, height: 100 },
    dirty: false,
    documentPath: null,
    createdAt: 0,
    closing: false,
    ...over,
  };
}

function byId(windows: WindowState[]): Map<WindowId, WindowState> {
  return new Map(windows.map((w) => [w.id, w]));
}

describe('processState', () => {
  it('is background when the process owns no live window', () => {
    expect(processState(process(1), byId([]), null)).toBe('background');
    // A window id that no longer exists is not a window.
    expect(processState(process(1, { windowIds: ['gone'] }), byId([]), null)).toBe('background');
  });

  it('is active when one of its windows has focus', () => {
    const p = process(1, { windowIds: ['w1', 'w2'] });
    const windows = byId([win('w1', 1, { minimized: true }), win('w2', 1)]);
    expect(processState(p, windows, 'w2')).toBe('active');
  });

  it('is minimized only when every window is', () => {
    const p = process(1, { windowIds: ['w1', 'w2'] });
    const allDown = byId([win('w1', 1, { minimized: true }), win('w2', 1, { minimized: true })]);
    const oneUp = byId([win('w1', 1, { minimized: true }), win('w2', 1)]);
    expect(processState(p, allDown, null)).toBe('minimized');
    expect(processState(p, oneUp, null)).toBe('running');
  });

  it('is running when it has a window but the focus is elsewhere', () => {
    const p = process(1, { windowIds: ['w1'] });
    expect(processState(p, byId([win('w1', 1)]), 'other')).toBe('running');
  });
});

describe('buildProcessRows', () => {
  const processes = [
    process(1, { windowIds: ['w1', 'w2'], name: 'Text Editor' }),
    process(2, { windowIds: [], name: 'Timer', appId: 'lumen.clock', background: true }),
  ];
  const windows = [win('w1', 1, { dirty: true }), win('w2', 1)];

  it('carries the identity, windows and state of each process', () => {
    const rows = buildProcessRows({ processes, windows, focusedId: 'w1' });
    expect(rows.map((r) => r.pid)).toEqual([1, 2]);
    expect(rows[0]?.windowIds).toEqual(['w1', 'w2']);
    expect(rows[0]?.state).toBe('active');
    expect(rows[0]?.name).toBe('Text Editor');
    expect(rows[1]?.appId).toBe('lumen.clock');
    expect(rows[1]?.state).toBe('background');
  });

  it('marks a process whose window has unsaved changes', () => {
    const rows = buildProcessRows({ processes, windows, focusedId: null });
    expect(rows[0]?.unsaved).toBe(true);
    expect(rows[1]?.unsaved).toBe(false);
  });

  it('drops window ids that no longer resolve', () => {
    const rows = buildProcessRows({
      processes: [process(1, { windowIds: ['w1', 'ghost'] })],
      windows: [win('w1', 1)],
      focusedId: null,
    });
    expect(rows[0]?.windowIds).toEqual(['w1']);
  });

  it('withholds memory unless the platform measures it per process', () => {
    const hidden = buildProcessRows({ processes, windows, focusedId: null });
    expect(hidden.every((r) => r.memory === null)).toBe(true);
    const shown = buildProcessRows({ processes, windows, focusedId: null, memoryAvailable: true });
    expect(shown[0]?.memory).toBe(1024);
  });
});

describe('processSortValue', () => {
  const row: ProcessRow = {
    pid: 7,
    appId: 'lumen.editor',
    name: 'Text Editor',
    windowIds: ['w1', 'w2'],
    state: 'running',
    startedAt: 5_000,
    unsaved: false,
    memory: null,
  };

  it('yields something sortable for every column', () => {
    const columns: ProcessColumnId[] = ['name', 'pid', 'windows', 'state', 'uptime', 'memory'];
    for (const column of columns) {
      expect(['string', 'number', 'object']).toContain(typeof processSortValue(row, column));
    }
    expect(processSortValue(row, 'name')).toBe('Text Editor');
    expect(processSortValue(row, 'pid')).toBe(7);
    expect(processSortValue(row, 'windows')).toBe(2);
    expect(processSortValue(row, 'memory')).toBeNull();
  });

  it('ranks the states from most to least active', () => {
    const rank = (state: ProcessRow['state']) => processSortValue({ ...row, state }, 'state');
    expect(rank('active')).toBeLessThan(rank('running') as number);
    expect(rank('running')).toBeLessThan(rank('minimized') as number);
    expect(rank('minimized')).toBeLessThan(rank('background') as number);
  });

  it('sorts the youngest process first by uptime, without reading a clock', () => {
    const young = processSortValue({ ...row, startedAt: 9_000 }, 'uptime') as number;
    const old = processSortValue({ ...row, startedAt: 1_000 }, 'uptime') as number;
    expect(young).toBeLessThan(old);
  });
});

describe('processSignature', () => {
  const table = (list: Process[]): Record<Pid, Process> =>
    Object.fromEntries(list.map((p) => [p.pid, p]));

  it('ignores the kernel load tick, which rewrites cpu and memory', () => {
    const before = processSignature(table([process(1, { cpu: 1, memory: 10 })]));
    const after = processSignature(table([process(1, { cpu: 90, memory: 999 })]));
    expect(after).toBe(before);
  });

  it('changes when a process starts or exits', () => {
    const one = processSignature(table([process(1)]));
    const two = processSignature(table([process(1), process(2)]));
    expect(two).not.toBe(one);
    expect(processSignature(table([]))).not.toBe(one);
  });

  it('changes when a process gains or loses a window', () => {
    const before = processSignature(table([process(1, { windowIds: ['w1'] })]));
    const after = processSignature(table([process(1, { windowIds: ['w1', 'w2'] })]));
    expect(after).not.toBe(before);
  });

  it('does not depend on the order of the table', () => {
    expect(processSignature(table([process(1), process(2)]))).toBe(
      processSignature(table([process(2), process(1)])),
    );
  });
});

describe('windowSignature', () => {
  const table = (list: WindowState[]): Record<WindowId, WindowState> =>
    Object.fromEntries(list.map((w) => [w.id, w]));

  it('ignores geometry, which moves at pointer rate', () => {
    const before = windowSignature(table([win('w1', 1)]), null);
    const after = windowSignature(
      table([win('w1', 1, { bounds: { x: 40, y: 80, width: 10, height: 10 }, zIndex: 300 })]),
      null,
    );
    expect(after).toBe(before);
  });

  it('changes when focus, minimized or dirty changes', () => {
    const base = windowSignature(table([win('w1', 1)]), null);
    expect(windowSignature(table([win('w1', 1)]), 'w1')).not.toBe(base);
    expect(windowSignature(table([win('w1', 1, { minimized: true })]), null)).not.toBe(base);
    expect(windowSignature(table([win('w1', 1, { dirty: true })]), null)).not.toBe(base);
  });

  it('does not depend on the order of the table', () => {
    expect(windowSignature(table([win('w1', 1), win('w2', 2)]), null)).toBe(
      windowSignature(table([win('w2', 2), win('w1', 1)]), null),
    );
  });
});

describe('endProcessMessage', () => {
  const row = (pid: Pid, over: Partial<ProcessRow> = {}): ProcessRow => ({
    pid,
    appId: 'lumen.editor',
    name: `App ${pid}`,
    windowIds: [],
    state: 'running',
    startedAt: 0,
    unsaved: false,
    memory: null,
    ...over,
  });

  it('asks nothing when there is no unsaved work and the monitor is not in the selection', () => {
    expect(endProcessMessage([row(1), row(2)], 99)).toBeNull();
  });

  it('names the one app with unsaved work', () => {
    const message = endProcessMessage([row(1, { unsaved: true, name: 'Notes' })], 99);
    expect(message).toBe('Notes has unsaved changes. Ending it loses them.');
  });

  it('counts several apps with unsaved work', () => {
    const message = endProcessMessage([row(1, { unsaved: true }), row(2, { unsaved: true })], 99);
    expect(message).toContain('2 apps have unsaved changes');
  });

  it('warns when the selection includes this window', () => {
    expect(endProcessMessage([row(1)], 1)).toBe(
      'Task Manager is in the selection, so this window closes.',
    );
  });

  it('says both things when both apply', () => {
    const message = endProcessMessage([row(1, { unsaved: true, name: 'Notes' }), row(2)], 2);
    expect(message).toContain('Notes has unsaved changes');
    expect(message).toContain('Task Manager is in the selection');
  });
});

describe('nextSelection', () => {
  const ordered: Pid[] = [1, 2, 3, 4];

  it('moves to the row after the last one removed', () => {
    expect(nextSelection(ordered, [2])).toBe(3);
    expect(nextSelection(ordered, [1, 2])).toBe(3);
  });

  it('falls back to the row before when the removed rows end the list', () => {
    expect(nextSelection(ordered, [4])).toBe(3);
    expect(nextSelection(ordered, [3, 4])).toBe(2);
  });

  it('skips over other removed rows', () => {
    expect(nextSelection(ordered, [2, 3])).toBe(4);
    expect(nextSelection(ordered, [1, 3, 4])).toBe(2);
  });

  it('has nothing to select when the table empties', () => {
    expect(nextSelection(ordered, ordered)).toBeNull();
    expect(nextSelection([], [1])).toBeNull();
  });

  it('has nothing to select when nothing was removed', () => {
    expect(nextSelection(ordered, [])).toBeNull();
    expect(nextSelection(ordered, [99])).toBeNull();
  });
});

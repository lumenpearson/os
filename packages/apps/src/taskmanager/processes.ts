/**
 * The process table's row model, derived from the kernel's process and window
 * stores. Everything here is pure so the table can be tested without a kernel.
 */
import type { AppId, Pid, Process, WindowId, WindowState } from '@lumen/kernel';
import type { SortValue } from './sort';

export type ProcessStateId = 'active' | 'running' | 'minimized' | 'background';

export const PROCESS_STATE_LABEL: Record<ProcessStateId, string> = {
  active: 'Active',
  running: 'Running',
  minimized: 'Minimized',
  background: 'Background',
};

/** Sort order for the State column: most active first. */
const STATE_RANK: Record<ProcessStateId, number> = {
  active: 0,
  running: 1,
  minimized: 2,
  background: 3,
};

export interface ProcessRow {
  pid: Pid;
  appId: AppId;
  name: string;
  /** Windows this process still owns, in the order it opened them. */
  windowIds: WindowId[];
  state: ProcessStateId;
  startedAt: number;
  /** A window of this process has unsaved changes. */
  unsaved: boolean;
  /** Bytes, or null when the platform cannot attribute memory to a process. */
  memory: number | null;
}

export interface ProcessTableInput {
  processes: readonly Process[];
  windows: readonly WindowState[];
  focusedId: WindowId | null;
  /**
   * Only true where the platform measures memory per process. The browser
   * build's `Process.memory` is a simulated random walk, so it stays hidden.
   */
  memoryAvailable?: boolean;
}

export function processState(
  process: Process,
  byId: ReadonlyMap<WindowId, WindowState>,
  focusedId: WindowId | null,
): ProcessStateId {
  const windows = process.windowIds.map((id) => byId.get(id)).filter((w) => w !== undefined);
  if (windows.length === 0) return 'background';
  if (focusedId !== null && process.windowIds.includes(focusedId)) return 'active';
  if (windows.every((w) => w.minimized)) return 'minimized';
  return 'running';
}

export function buildProcessRows(input: ProcessTableInput): ProcessRow[] {
  const byId = new Map(input.windows.map((w) => [w.id, w] as const));
  return input.processes.map((p) => {
    const windows = p.windowIds.map((id) => byId.get(id)).filter((w) => w !== undefined);
    return {
      pid: p.pid,
      appId: p.appId,
      name: p.name,
      windowIds: windows.map((w) => w.id),
      state: processState(p, byId, input.focusedId),
      startedAt: p.startedAt,
      unsaved: windows.some((w) => w.dirty),
      memory: input.memoryAvailable ? p.memory : null,
    };
  });
}

export type ProcessColumnId = 'name' | 'pid' | 'windows' | 'state' | 'uptime' | 'memory';

export function processSortValue(row: ProcessRow, column: ProcessColumnId): SortValue {
  switch (column) {
    case 'name':
      return row.name;
    case 'pid':
      return row.pid;
    case 'windows':
      return row.windowIds.length;
    case 'state':
      return STATE_RANK[row.state];
    // Uptime is `now - startedAt`, so ascending uptime is descending start time.
    // Negating keeps the column sortable without a clock in the comparator.
    case 'uptime':
      return -row.startedAt;
    case 'memory':
      return row.memory;
  }
}

/**
 * A digest of everything the table draws. Selecting on this string instead of
 * on the process objects keeps the kernel's two-second load tick — which
 * rewrites every process — from re-rendering the table.
 */
export function processSignature(processes: Record<Pid, Process>): string {
  const parts: string[] = [];
  for (const p of Object.values(processes)) {
    parts.push(`${p.pid}:${p.appId}:${p.name}:${p.startedAt}:${p.windowIds.join('.')}`);
  }
  return parts.sort().join('|');
}

export function windowSignature(
  windows: Record<WindowId, WindowState>,
  focusedId: WindowId | null,
): string {
  const parts: string[] = [];
  for (const w of Object.values(windows)) {
    parts.push(`${w.id}:${w.pid}:${w.minimized ? 1 : 0}:${w.dirty ? 1 : 0}`);
  }
  return `${focusedId ?? ''}#${parts.sort().join('|')}`;
}

/**
 * Why ending these processes needs a confirmation, or null when it does not.
 * Ending an app with no unsaved work is as reversible as closing it.
 */
export function endProcessMessage(rows: readonly ProcessRow[], selfPid: Pid): string | null {
  const unsaved = rows.filter((r) => r.unsaved);
  const self = rows.some((r) => r.pid === selfPid);
  if (unsaved.length === 0 && !self) return null;
  const parts: string[] = [];
  const first = unsaved[0];
  if (unsaved.length === 1 && first) {
    parts.push(`${first.name} has unsaved changes. Ending it loses them.`);
  } else if (unsaved.length > 1) {
    parts.push(`${unsaved.length} apps have unsaved changes. Ending them loses the changes.`);
  }
  if (self) parts.push('Task Manager is in the selection, so this window closes.');
  return parts.join(' ');
}

/**
 * What to select after ending processes: the next row still in the table,
 * otherwise the previous one.
 */
export function nextSelection(ordered: readonly Pid[], removed: readonly Pid[]): Pid | null {
  const gone = new Set(removed);
  const last = ordered.reduce((acc, pid, i) => (gone.has(pid) ? i : acc), -1);
  if (last === -1) return null;
  for (let i = last + 1; i < ordered.length; i++) {
    const pid = ordered[i];
    if (pid !== undefined && !gone.has(pid)) return pid;
  }
  for (let i = last - 1; i >= 0; i--) {
    const pid = ordered[i];
    if (pid !== undefined && !gone.has(pid)) return pid;
  }
  return null;
}

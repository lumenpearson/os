/**
 * Two kinds of history.
 *
 * A `NavStack` is one tab's back/forward list: a line of addresses and a
 * cursor into it. Navigating somewhere new from the middle of the line
 * throws the forward part away, the way every browser does.
 *
 * The visit log is the global record shown on `lumen://history`: newest
 * first, one entry per visit, grouped by day for display.
 */

export interface NavStack {
  entries: string[];
  index: number;
}

/** Enough to walk back through a long session without growing without bound. */
export const MAX_STACK_ENTRIES = 60;

export function createStack(url: string): NavStack {
  return { entries: [url], index: 0 };
}

export function currentEntry(stack: NavStack): string {
  return stack.entries[stack.index] ?? '';
}

export function canGoBack(stack: NavStack): boolean {
  return stack.index > 0;
}

export function canGoForward(stack: NavStack): boolean {
  return stack.index < stack.entries.length - 1;
}

/** Append after the cursor, dropping anything that was ahead of it. */
export function pushEntry(stack: NavStack, url: string): NavStack {
  if (currentEntry(stack) === url) return stack;
  const kept = stack.entries.slice(0, stack.index + 1);
  kept.push(url);
  const overflow = Math.max(0, kept.length - MAX_STACK_ENTRIES);
  const entries = kept.slice(overflow);
  return { entries, index: entries.length - 1 };
}

export function goBack(stack: NavStack): NavStack {
  return canGoBack(stack) ? { entries: stack.entries, index: stack.index - 1 } : stack;
}

export function goForward(stack: NavStack): NavStack {
  return canGoForward(stack) ? { entries: stack.entries, index: stack.index + 1 } : stack;
}

// ── the visit log ─────────────────────────────────────────────────────────

export interface Visit {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}

export const MAX_VISITS = 500;

/**
 * Record a visit at the head of the log. Reloading or returning to the page
 * that is already at the head updates that entry instead of stacking
 * duplicates.
 */
export function recordVisit(log: readonly Visit[], visit: Visit, limit = MAX_VISITS): Visit[] {
  const head = log[0];
  if (head && head.url === visit.url) {
    const merged: Visit = {
      ...head,
      title: visit.title || head.title,
      visitedAt: visit.visitedAt,
    };
    return [merged, ...log.slice(1)];
  }
  return [visit, ...log].slice(0, limit);
}

export function setVisitTitle(log: readonly Visit[], id: string, title: string): Visit[] {
  return log.map((v) => (v.id === id ? { ...v, title } : v));
}

export function removeVisit(log: readonly Visit[], id: string): Visit[] {
  return log.filter((v) => v.id !== id);
}

/** Case-insensitive match on the title or the address. */
export function searchVisits(log: readonly Visit[], query: string, limit = MAX_VISITS): Visit[] {
  const q = query.trim().toLowerCase();
  if (!q) return log.slice(0, limit);
  const out: Visit[] = [];
  for (const v of log) {
    if (v.title.toLowerCase().includes(q) || v.url.toLowerCase().includes(q)) out.push(v);
    if (out.length === limit) break;
  }
  return out;
}

/** The most recent visit per address, newest first. */
export function uniqueByUrl(log: readonly Visit[], limit = MAX_VISITS): Visit[] {
  const seen = new Set<string>();
  const out: Visit[] = [];
  for (const v of log) {
    if (seen.has(v.url)) continue;
    seen.add(v.url);
    out.push(v);
    if (out.length === limit) break;
  }
  return out;
}

/** Local midnight before `time`, as a timestamp. */
export function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface DayGroup {
  /** Local midnight that starts the day. */
  day: number;
  visits: Visit[];
}

/** Group by local day, newest day first, newest visit first inside a day. */
export function groupVisitsByDay(log: readonly Visit[]): DayGroup[] {
  const byDay = new Map<number, Visit[]>();
  for (const v of log) {
    const day = startOfDay(v.visitedAt);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(v);
    else byDay.set(day, [v]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, visits]) => ({
      day,
      visits: [...visits].sort((a, b) => b.visitedAt - a.visitedAt),
    }));
}

/** "Today" / "Yesterday", or null when the caller should format the date. */
export function relativeDayLabel(day: number, now: number): 'Today' | 'Yesterday' | null {
  const today = startOfDay(now);
  if (day === today) return 'Today';
  if (day === startOfDay(today - 1)) return 'Yesterday';
  return null;
}

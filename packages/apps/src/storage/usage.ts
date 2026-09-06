/**
 * What is used, who says so, and what nobody can say.
 *
 * Two figures exist for the same disk: the one the file system reports for
 * itself, and the one the browser reports for this origin. They are measured
 * differently and often differ. This file keeps them apart — the file
 * system's figure is the one the app shows, the browser's is printed next to
 * it — and never averages, prefers or quietly drops one. Anything neither can
 * answer becomes an em-dash and the reason.
 */

import { formatBytes } from '@lumen/vfs';
import type { CategoryTotal } from './categories';

export interface Reading {
  value: string;
  available: boolean;
  /** Why the figure is missing. Set whenever `available` is false. */
  reason?: string;
}

/** Printed wherever a figure could not be read. */
export const NO_VALUE = '—';

export function known(value: string): Reading {
  return { value, available: true };
}

export function unknown(reason: string): Reading {
  return { value: '', available: false, reason };
}

export const REASONS = {
  adapter: 'The file system did not answer when asked how much space it uses.',
  quota: 'This file system reports no limit, so there is nothing to measure against.',
  estimateMissing: 'This browser does not implement navigator.storage.estimate().',
  estimateFailed: 'The browser refused to estimate storage for this origin.',
} as const;

export interface AdapterUsage {
  used: number;
  quota: number | null;
}

export interface BrowserEstimate {
  usage: number | null;
  quota: number | null;
}

export interface UsageSources {
  /** `vfs.adapter.id`: opfs, indexeddb, memory or tauri. */
  adapterId: string;
  /** `vfs.usage()`, or null when the call failed. */
  adapter: AdapterUsage | null;
  /** `navigator.storage.estimate()`, or null when there is nothing to report. */
  browser: BrowserEstimate | null;
  /** Why there is no browser estimate. Set whenever `browser` is null. */
  browserReason?: string;
}

export interface UsageReport {
  used: Reading;
  quota: Reading;
  /** What the browser says about this origin, or why it says nothing. */
  browser: Reading;
  /** Used over quota, 0–1, or null when there is no pair to divide. */
  fraction: number | null;
  /** One line, set only when the two sources disagree by more than noise. */
  disagreement: string | null;
  /** Where the figures above come from. */
  source: string;
}

/** Whether `navigator.storage.estimate()` describes this file system at all. */
export function browserBacked(adapterId: string): { backed: boolean; reason: string } {
  switch (adapterId) {
    case 'opfs':
      return { backed: true, reason: 'Files live in the origin private file system.' };
    case 'indexeddb':
      return { backed: true, reason: 'Files live in an IndexedDB database.' };
    case 'memory':
      return {
        backed: false,
        reason:
          'Files are held in memory for this session, so the browser storage estimate does not describe them.',
      };
    case 'tauri':
      return {
        backed: false,
        reason:
          'Files are stored by the desktop host, so the browser storage estimate does not describe them.',
      };
    default:
      return {
        backed: false,
        reason: `It is not known whether the ${adapterId} file system is held in browser storage, so its estimate is reported on its own.`,
      };
  }
}

/** Below this the two sources are measuring the same thing to the byte. */
const DISAGREEMENT_SHARE = 0.02;
const DISAGREEMENT_BYTES = 64 * 1024;

export function buildUsageReport(sources: UsageSources): UsageReport {
  const { adapterId, adapter, browser } = sources;
  const backing = browserBacked(adapterId);
  const used = adapter ? known(formatBytes(adapter.used)) : unknown(REASONS.adapter);
  const quota =
    adapter && typeof adapter.quota === 'number' && adapter.quota > 0
      ? known(formatBytes(adapter.quota))
      : unknown(adapter ? REASONS.quota : REASONS.adapter);
  const fraction =
    adapter && typeof adapter.quota === 'number' && adapter.quota > 0
      ? Math.min(1, Math.max(0, adapter.used / adapter.quota))
      : null;

  let browserReading: Reading;
  if (!browser || typeof browser.usage !== 'number') {
    browserReading = unknown(sources.browserReason ?? REASONS.estimateMissing);
  } else if (!backing.backed) {
    browserReading = unknown(backing.reason);
  } else {
    const quotaPart =
      typeof browser.quota === 'number' && browser.quota > 0
        ? ` of ${formatBytes(browser.quota)}`
        : '';
    browserReading = known(`${formatBytes(browser.usage)}${quotaPart}`);
  }

  return {
    used,
    quota,
    browser: browserReading,
    fraction,
    disagreement: disagreementNote(adapterId, adapter, browser, backing.backed),
    source: `Measured by the ${adapterId} file system. ${backing.reason}`,
  };
}

function disagreementNote(
  adapterId: string,
  adapter: AdapterUsage | null,
  browser: BrowserEstimate | null,
  backed: boolean,
): string | null {
  if (!adapter || !browser || typeof browser.usage !== 'number' || !backed) return null;
  const difference = Math.abs(browser.usage - adapter.used);
  const largest = Math.max(browser.usage, adapter.used, 1);
  if (difference < DISAGREEMENT_BYTES || difference / largest < DISAGREEMENT_SHARE) return null;
  return `The browser reports ${formatBytes(browser.usage)} for this origin; the ${adapterId} file system reports ${formatBytes(adapter.used)}. The figures here are the file system's.`;
}

export interface Segment {
  id: string;
  label: string;
  bytes: number;
  files: number;
  /** Share of the segmented total, 0–1. */
  share: number;
  /** CSS colour: the accent for the largest segment, a neutral otherwise. */
  color: string;
  accent: boolean;
}

export interface TrashTotal {
  bytes: number;
  files: number;
}

/**
 * One ramp, one accent. The largest segment is the only coloured thing on the
 * bar; everything else steps down a neutral scale so the eye reads size from
 * length, which is the measurement, rather than from hue, which is not.
 */
export function segmentColor(step: number, steps: number): string {
  if (steps <= 1) return 'color-mix(in srgb, var(--lumen-ink-2) 62%, var(--lumen-surface-3))';
  const mix = Math.round(62 - (Math.min(step, steps - 1) / (steps - 1)) * 48);
  return `color-mix(in srgb, var(--lumen-ink-2) ${mix}%, var(--lumen-surface-3))`;
}

/**
 * Categories largest first, then the Trash, which is always its own segment
 * because emptying it is the one thing this window can act on.
 */
export function buildSegments(
  totals: readonly CategoryTotal[],
  trash: TrashTotal | null,
): Segment[] {
  const used = totals.filter((t) => t.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  const rows: Array<{ id: string; label: string; bytes: number; files: number }> = used.map(
    (t) => ({
      id: t.category,
      label: t.label,
      bytes: t.bytes,
      files: t.files,
    }),
  );
  if (trash) rows.push({ id: 'trash', label: 'Trash', bytes: trash.bytes, files: trash.files });
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  let accentAt = -1;
  rows.forEach((row, i) => {
    if (row.bytes > 0 && (accentAt === -1 || row.bytes > (rows[accentAt]?.bytes ?? 0)))
      accentAt = i;
  });
  let step = 0;
  return rows.map((row, i) => {
    const accent = i === accentAt;
    return {
      ...row,
      share: total > 0 ? row.bytes / total : 0,
      accent,
      color: accent ? 'var(--lumen-accent)' : segmentColor(step++, Math.max(1, rows.length - 1)),
    };
  });
}

/** "3%", "0.4%", or "<0.1%" for a share too small to round to a digit. */
export function formatShare(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return '0%';
  const percent = fraction * 100;
  if (percent < 0.1) return '<0.1%';
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
}

/**
 * The gap between what the file system says is used and what the segments
 * add up to. Stated rather than hidden: the segments describe one folder and
 * the Trash, and the file system's figure describes everything it holds.
 */
export function coverageNote(
  segmented: number,
  adapter: AdapterUsage | null,
  root: string,
): string | null {
  if (!adapter) return null;
  const difference = adapter.used - segmented;
  if (Math.abs(difference) < 1024) return null;
  if (difference > 0) {
    return `${formatBytes(difference)} more is in use than these segments cover: files outside ${root} and the Trash, and any space the storage layer takes for itself.`;
  }
  return `These segments cover ${formatBytes(-difference)} more than the file system reports as used.`;
}

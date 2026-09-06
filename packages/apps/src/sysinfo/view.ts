/**
 * The small amount of logic the window needs on top of `sections.ts`: which
 * section feeds the hero, the line printed under the mark, the one bar the
 * Storage section draws, and the count in the status bar.
 *
 * Everything here reads what was already measured. Nothing rounds a figure up
 * to a friendlier one, and the bar is drawn only when both of its numbers
 * exist — a bar against an unknown quota would be a picture of a guess.
 */

import { formatBytes } from '@lumen/vfs';
import { NO_VALUE, REASONS } from './probe';
import { countUnavailable, type FactRow, type Section, type StorageReading } from './sections';

/** The section that becomes the hero card rather than a plain list. */
export const OVERVIEW_ID = 'overview';

export interface SplitSections {
  /** The overview, or null if `buildSections` did not produce one. */
  overview: Section | null;
  /** Every other section, in the order it was built. */
  rest: Section[];
}

export function splitOverview(sections: readonly Section[]): SplitSections {
  return {
    overview: sections.find((s) => s.id === OVERVIEW_ID) ?? null,
    rest: sections.filter((s) => s.id !== OVERVIEW_ID),
  };
}

export function findRow(section: Section | null, id: string): FactRow | undefined {
  return section?.rows.find((r) => r.id === id);
}

/** The value of a row, or null when the platform could not report it. */
function value(section: Section | null, id: string): string | null {
  const fact = findRow(section, id)?.fact;
  return fact?.available ? fact.value : null;
}

/**
 * The line under the mark: the version this build carries and what it is
 * running as. An em-dash if the bridge answered neither.
 */
export function heroSubline(overview: Section | null): string {
  const parts = [value(overview, 'overview.version'), value(overview, 'overview.build')].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : NO_VALUE;
}

/** Title for the copied and saved report. */
export function reportTitle(overview: Section | null): string {
  const version = value(overview, 'overview.version');
  return version ? `Lumen OS ${version} — System Information` : 'Lumen OS — System Information';
}

export interface StorageBarModel {
  /** Used over quota, 0–1. Null when there is no pair of numbers to draw. */
  fraction: number | null;
  /** "1.2 GB of 40 GB used (3%)", or the part of it that is known. */
  caption: string;
  /** Why there is no bar. Set whenever `fraction` is null. */
  reason?: string;
}

/** "3%", "0.4%", or "<0.1%" for a fraction too small to round to a digit. */
export function formatPercent(fraction: number): string {
  const percent = fraction * 100;
  if (percent > 0 && percent < 0.1) return '<0.1%';
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
}

export function storageBar(reading: StorageReading | null): StorageBarModel {
  if (!reading || !Number.isFinite(reading.used) || reading.used < 0) {
    return { fraction: null, caption: NO_VALUE, reason: REASONS.storage };
  }
  const { used, quota } = reading;
  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) {
    return { fraction: null, caption: `${formatBytes(used)} in use`, reason: REASONS.quota };
  }
  const fraction = Math.min(1, used / quota);
  return {
    fraction,
    caption: `${formatBytes(used)} of ${formatBytes(quota)} used (${formatPercent(fraction)})`,
  };
}

export interface ReadingCount {
  total: number;
  /** Rows this platform could not fill in. */
  missing: number;
}

export function countReadings(sections: readonly Section[]): ReadingCount {
  return {
    total: sections.reduce((count, section) => count + section.rows.length, 0),
    missing: countUnavailable(sections),
  };
}

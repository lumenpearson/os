/**
 * Which installed packages the catalogue has a newer version of.
 *
 * The store is a directory of static files with a version on every package,
 * and the library knows the version of everything installed from it. An
 * update is the two disagreeing, in one direction. That is the whole source:
 * nothing here invents a release, and with no catalogue in hand the answer is
 * an empty list rather than a guess.
 *
 * Settings > General > Automatic updates decides what happens next — the
 * storefront installs them itself, or lists them and waits.
 */

import type { LibraryEntry } from './library';
import type { PackageSummary } from './remote';

export interface AvailableUpdate {
  id: string;
  name: string;
  /** The version on the system. */
  from: string;
  /** The version the catalogue lists. */
  to: string;
  summary: PackageSummary;
}

/**
 * Compare two dotted versions the way a person reads them: 1.10.0 is newer
 * than 1.9.0, and a missing numeric part is zero, so 1.2 and 1.2.0 are the
 * same version.
 *
 * A trailing part that is not a number is a pre-release tag, and it sorts
 * *below* the release it names: 1.0.0-beta comes before 1.0.0. Getting that
 * backwards would have the store offer a beta as an update over the release,
 * which is the one direction an update must never go on its own.
 */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i];
    const y = right[i];
    if (x === undefined || y === undefined) {
      const extra = (x ?? y) as string;
      // A tag where the other side has nothing: that side is the release.
      if (!numeric(extra)) return x === undefined ? 1 : -1;
      if (Number(extra) === 0) continue;
      return x === undefined ? -1 : 1;
    }
    if (x === y) continue;
    if (numeric(x) && numeric(y)) return Number(x) < Number(y) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function numeric(part: string): boolean {
  return /^\d+$/.test(part);
}

function parts(version: string): string[] {
  const trimmed = version.trim().replace(/^v/i, '');
  return trimmed.length === 0 ? ['0'] : trimmed.split(/[.\-+]/);
}

/** True when `candidate` is a version worth offering over `current`. */
export function isNewer(current: string | null, candidate: string): boolean {
  if (current === null || current.trim().length === 0) return false;
  return compareVersions(candidate, current) > 0;
}

/**
 * The updates on offer, in the order the catalogue lists them.
 *
 * Only installed entries are considered — a built-in app is part of the OS
 * and is not the store's to replace — and only ones carrying a version, since
 * a manifest with no version gives nothing to compare and silently replacing
 * it would be an update the person never asked for.
 */
export function availableUpdates(
  entries: readonly LibraryEntry[],
  catalogue: readonly PackageSummary[],
): AvailableUpdate[] {
  const installed = new Map<string, LibraryEntry>();
  for (const entry of entries) {
    if (entry.source === 'installed') installed.set(entry.id, entry);
  }
  const out: AvailableUpdate[] = [];
  for (const summary of catalogue) {
    const entry = installed.get(summary.id);
    if (!entry || !isNewer(entry.version, summary.version)) continue;
    out.push({
      id: summary.id,
      name: entry.name,
      from: entry.version as string,
      to: summary.version,
      summary,
    });
  }
  return out;
}

/** "2 updates available", for a status line that has to say how many. */
export function updateCountLabel(count: number): string {
  if (count === 0) return 'No updates available';
  return count === 1 ? '1 update available' : `${count} updates available`;
}

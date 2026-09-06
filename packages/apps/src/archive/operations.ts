/**
 * What an extraction will do, worked out before a single byte is written.
 *
 * Every target path goes through `extractionPath`, so the plan cannot contain
 * a write outside the destination; an entry whose name reduces to nothing is
 * refused and named in the report rather than dropped in silence.
 */

import { extractionPath } from './entryPath';
import type { ZipEntry } from './zip';

export interface PlannedWrite {
  /** Index into the archive's entries. */
  index: number;
  entry: ZipEntry;
  /** Absolute VFS path, always inside the destination. */
  target: string;
}

export interface ExtractionPlan {
  writes: PlannedWrite[];
  /** Names that could not be made safe, in the order they appear. */
  refused: string[];
}

export function planExtraction(
  entries: readonly ZipEntry[],
  indices: readonly number[],
  destination: string,
): ExtractionPlan {
  const writes: PlannedWrite[] = [];
  const refused: string[] = [];
  for (const index of indices) {
    const entry = entries[index];
    if (!entry) continue;
    const target = extractionPath(destination, entry.name);
    if (target === null) refused.push(entry.name);
    else writes.push({ index, entry, target });
  }
  return { writes, refused };
}

export interface ExtractionResult {
  written: number;
  /** Entries whose name could not be made safe. */
  refused: number;
  /** Entries that failed to unpack, with the first reason. */
  failed: number;
  firstFailure: string | null;
  destination: string;
}

const count = (value: number, word: string) => `${value} ${word}${value === 1 ? '' : 's'}`;

/** One sentence for the notification, saying exactly what happened. */
export function describeExtraction(result: ExtractionResult): string {
  const parts = [`Extracted ${count(result.written, 'item')} to ${result.destination}`];
  if (result.refused > 0) parts.push(`${count(result.refused, 'unsafe name')} skipped`);
  if (result.failed > 0) {
    parts.push(
      `${count(result.failed, 'entry')} failed${result.firstFailure ? `: ${result.firstFailure}` : ''}`,
    );
  }
  return `${parts.join('. ')}.`;
}

/**
 * The pseudo-programs that ship with the OS.
 *
 * Each one is a complete `.app` manifest — the same JSON a person would write
 * by hand — so installing from the catalogue and installing from a file take
 * exactly the same path through the kernel. They are small HTML programs that
 * run in `lumen.webapp`'s sandboxed frame.
 */

import type { AppManifest } from '@lumen/kernel';
import type { LibraryEntry } from './library';
import { COLOUR } from './programs/colour';
import { CONVERTER } from './programs/converter';
import { JSON_FORMATTER } from './programs/json';
import { MARKDOWN } from './programs/markdown';
import { POMODORO } from './programs/pomodoro';

export const CATALOGUE: readonly AppManifest[] = [
  CONVERTER,
  COLOUR,
  MARKDOWN,
  JSON_FORMATTER,
  POMODORO,
];

export function catalogueById(id: string): AppManifest | undefined {
  return CATALOGUE.find((m) => m.id === id);
}

/**
 * `installed` — already on the system, from here or from a file.
 * `shadowed`  — a built-in app owns the id, so the OS would ignore the file.
 * `available` — not installed.
 */
export type CatalogueStatus = 'available' | 'installed' | 'shadowed';

export function catalogueStatus(
  manifest: AppManifest,
  entries: readonly LibraryEntry[],
): CatalogueStatus {
  const existing = entries.find((e) => e.id === manifest.id);
  if (!existing) return 'available';
  return existing.source === 'built-in' ? 'shadowed' : 'installed';
}

/** Catalogue entries whose name, id, description or keywords contain the query. */
export function searchCatalogue(query: string): AppManifest[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...CATALOGUE];
  return CATALOGUE.filter((m) =>
    [m.name, m.id, m.description ?? '', ...(m.keywords ?? [])].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

/** Catalogue entries not yet on the system. */
export function availableFromCatalogue(entries: readonly LibraryEntry[]): AppManifest[] {
  return CATALOGUE.filter((m) => catalogueStatus(m, entries) === 'available');
}

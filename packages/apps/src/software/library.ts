/**
 * One list for two kinds of app.
 *
 * The kernel keeps built-in apps (`AppDefinition`, registered at boot) and
 * installed pseudo-programs (`InstalledApp`, a `.app` manifest under
 * /Applications) in separate maps, and a manifest whose id matches a built-in
 * is ignored entirely. Software Center shows both, so this flattens them into
 * one row shape and does the searching and filtering.
 */

import type { AppCategory, AppDefinition, AppManifest, InstalledApp } from '@lumen/kernel';

export type EntrySource = 'built-in' | 'installed';

/** How the entry is run. Built-ins are React components; the rest is a manifest. */
export type EntryKind = 'built-in' | 'alias' | 'script' | 'html';

export interface LibraryEntry {
  id: string;
  name: string;
  description: string;
  version: string | null;
  category: AppCategory;
  keywords: readonly string[];
  source: EntrySource;
  kind: EntryKind;
  /** Built-ins are part of the OS and stay. */
  removable: boolean;
  /** VFS path of the `.app` file; built-ins have none. */
  path: string | null;
  definition: AppDefinition | null;
  manifest: AppManifest | null;
}

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  system: 'System',
  utilities: 'Utilities',
  office: 'Office',
  media: 'Media',
  internet: 'Internet',
  developer: 'Developer',
  games: 'Games',
  user: 'User',
};

export function manifestKind(manifest: AppManifest): EntryKind {
  if (manifest.alias) return 'alias';
  if (manifest.script) return 'script';
  return 'html';
}

export const KIND_LABELS: Record<EntryKind, string> = {
  'built-in': 'Built-in app',
  alias: 'Alias to a built-in app',
  script: 'Shell script',
  html: 'HTML program',
};

function fromDefinition(app: AppDefinition): LibraryEntry {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    version: app.version ?? null,
    category: app.category,
    keywords: app.keywords ?? [],
    source: 'built-in',
    kind: 'built-in',
    removable: false,
    path: null,
    definition: app,
    manifest: null,
  };
}

function fromInstalled(installed: InstalledApp): LibraryEntry {
  const m = installed.manifest;
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? '',
    version: m.version ?? null,
    category: m.category ?? 'user',
    keywords: m.keywords ?? [],
    source: 'installed',
    kind: manifestKind(m),
    removable: true,
    path: installed.path,
    definition: null,
    manifest: m,
  };
}

/**
 * Every app on the system, by name. A built-in wins over a manifest with the
 * same id, because that is what the kernel does when it launches one.
 */
export function buildLibrary(
  apps: readonly AppDefinition[],
  installed: readonly InstalledApp[],
): LibraryEntry[] {
  const byId = new Map<string, LibraryEntry>();
  for (const app of installed) byId.set(app.manifest.id, fromInstalled(app));
  for (const app of apps) byId.set(app.id, fromDefinition(app));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findEntry(
  entries: readonly LibraryEntry[],
  id: string | null,
): LibraryEntry | undefined {
  if (!id) return undefined;
  return entries.find((e) => e.id === id);
}

export interface LibraryFilter {
  query?: string;
  /** A category id, or 'all'. */
  category?: string;
}

export function entryMatches(entry: LibraryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  const haystack = [entry.name, entry.id, entry.description, ...entry.keywords];
  return haystack.some((h) => h.toLowerCase().includes(q));
}

export function filterEntries(
  entries: readonly LibraryEntry[],
  filter: LibraryFilter = {},
): LibraryEntry[] {
  const category = filter.category ?? 'all';
  const query = filter.query ?? '';
  return entries.filter(
    (e) => (category === 'all' || e.category === category) && entryMatches(e, query),
  );
}

export interface CategoryOption {
  value: string;
  label: string;
  count: number;
}

/** "All apps" first, then every category present, in the order they are declared. */
export function categoryOptions(entries: readonly LibraryEntry[]): CategoryOption[] {
  const counts = new Map<AppCategory, number>();
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const options: CategoryOption[] = [
    { value: 'all', label: `All apps (${entries.length})`, count: entries.length },
  ];
  for (const [category, label] of Object.entries(CATEGORY_LABELS) as Array<[AppCategory, string]>) {
    const count = counts.get(category);
    if (count) options.push({ value: category, label: `${label} (${count})`, count });
  }
  return options;
}

export function countBySource(entries: readonly LibraryEntry[]): Record<EntrySource, number> {
  let builtIn = 0;
  let installed = 0;
  for (const e of entries) {
    if (e.source === 'built-in') builtIn += 1;
    else installed += 1;
  }
  return { 'built-in': builtIn, installed };
}

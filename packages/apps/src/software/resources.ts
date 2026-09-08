/**
 * Where a typeface or an icon set goes when it is installed.
 *
 * An app from the store is a `.app` manifest and takes the road every other
 * pseudo-program takes: `planInstall` decides, `Kernel.installApp` writes it.
 * A font or an icon set is not an app and the kernel has no register for one,
 * so the payload is written under the user's home as the document the store
 * served, and a small record beside it lists what has been installed. That
 * record is what lets the storefront say "Installed" on a typeface after a
 * restart, and it is the only claim made for it: nothing in the OS loads these
 * files yet.
 */

import { join } from '@lumen/vfs';
import type { PayloadDocument } from './remote';

/** Everything the Software Center keeps for itself lives under one folder. */
export const STORE_DIR = '.store';
export const FONTS_DIR = join(STORE_DIR, 'fonts');
export const ICONS_DIR = join(STORE_DIR, 'icons');

export type ResourceKind = 'font' | 'icons';

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  font: 'Typeface',
  icons: 'Icon set',
};

/** The catalogue kept between sessions. */
export function cachePath(home: string): string {
  return join(home, STORE_DIR, 'catalogue.json');
}

/** The list of typefaces and icon sets installed from a store. */
export function recordPath(home: string): string {
  return join(home, STORE_DIR, 'resources.json');
}

export function resourcePath(home: string, kind: ResourceKind, id: string): string {
  return join(home, kind === 'font' ? FONTS_DIR : ICONS_DIR, `${id}.json`);
}

export interface InstalledResource {
  id: string;
  kind: ResourceKind;
  name: string;
  version: string;
  /** Where the payload was written. */
  path: string;
  installedAt: number;
}

export interface ResourceRecord {
  version: number;
  resources: InstalledResource[];
}

export const RECORD_VERSION = 1;

export function emptyRecord(): ResourceRecord {
  return { version: RECORD_VERSION, resources: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readResource(value: unknown): InstalledResource | null {
  if (!isRecord(value)) return null;
  const { id, kind, name, version, path, installedAt } = value;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (kind !== 'font' && kind !== 'icons') return null;
  if (typeof path !== 'string' || path.length === 0) return null;
  return {
    id,
    kind,
    name: typeof name === 'string' ? name : id,
    version: typeof version === 'string' ? version : '',
    path,
    installedAt: typeof installedAt === 'number' && Number.isFinite(installedAt) ? installedAt : 0,
  };
}

/**
 * The record as read from disk. It is the OS's own file rather than a
 * download, but it is still a file a person can edit, so anything unreadable
 * in it is dropped instead of throwing: a broken line should cost one entry,
 * not the whole storefront.
 */
export function readRecord(value: unknown): ResourceRecord {
  if (!isRecord(value)) return emptyRecord();
  const version = value.version;
  if (typeof version !== 'number' || version > RECORD_VERSION) return emptyRecord();
  const list = Array.isArray(value.resources) ? value.resources : [];
  const resources: InstalledResource[] = [];
  for (const item of list) {
    const resource = readResource(item);
    if (resource && !resources.some((r) => r.id === resource.id)) resources.push(resource);
  }
  return { version: RECORD_VERSION, resources };
}

/** The record with one resource added, or replaced where the id is already in it. */
export function withResource(record: ResourceRecord, resource: InstalledResource): ResourceRecord {
  const resources = record.resources.filter((r) => r.id !== resource.id);
  resources.push(resource);
  resources.sort((a, b) => a.id.localeCompare(b.id));
  return { version: RECORD_VERSION, resources };
}

export function withoutResource(record: ResourceRecord, id: string): ResourceRecord {
  return { version: RECORD_VERSION, resources: record.resources.filter((r) => r.id !== id) };
}

export function resourceIds(record: ResourceRecord): string[] {
  return record.resources.map((r) => r.id);
}

/**
 * The document written to disk: the payload as the store served it, with the
 * package it came from named beside it so the file can be read on its own.
 */
export function resourceDocument(
  id: string,
  version: string,
  payload: PayloadDocument,
): Record<string, unknown> {
  if (payload.kind === 'font') {
    return { id, version, kind: 'font', family: payload.font.family, faces: payload.font.faces };
  }
  if (payload.kind === 'icons') {
    return { id, version, kind: 'icons', prefix: payload.icons.prefix, icons: payload.icons.icons };
  }
  return { id, version, kind: 'app', manifest: payload.manifest };
}

/** One sentence naming what was written and where. */
export function describeResource(resource: InstalledResource, detail: string): string {
  return `${RESOURCE_LABELS[resource.kind]} written to ${resource.path} (${detail}).`;
}

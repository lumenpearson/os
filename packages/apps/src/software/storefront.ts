/**
 * One list for two sources of software.
 *
 * The storefront draws packages from a store fetched over the network and the
 * five programs that ship inside the OS. They arrive in different shapes — a
 * `PackageSummary` from `index.json`, an `AppManifest` from `catalogue.ts` —
 * and the window should not care which is which beyond saying so, so both are
 * flattened here into one `Listing` and every filter, row and tile works on
 * that.
 *
 * A program that ships with the system is listed at the size the OS would
 * write to disk and at no price, because both are facts about it rather than
 * fields someone filled in.
 */

import type { AppManifest } from '@lumen/kernel';
import { CATALOGUE } from './catalogue';
import type { LibraryEntry } from './library';
import { formatManifest } from './manifest';
import type {
  Artwork,
  Catalogue,
  Collection,
  PackageKind,
  PackagePrice,
  PackageSummary,
  Section,
} from './remote';

/** `store` came over the network; `system` ships inside the OS. */
export type ListingOrigin = 'store' | 'system';

export interface Listing {
  id: string;
  kind: PackageKind;
  name: string;
  tagline: string;
  version: string;
  publisher: string;
  category: string;
  /** Payload bytes for a store package; bytes on disk for a system program. */
  size: number;
  price: PackagePrice;
  keywords: readonly string[];
  /** ISO 8601, or '' for a program that ships with the system. */
  updated: string;
  origin: ListingOrigin;
  /** A system program carries its manifest; a store package has none until it is downloaded. */
  manifest: AppManifest | null;
}

export const KIND_LABELS: Record<PackageKind, string> = {
  app: 'App',
  font: 'Typeface',
  icons: 'Icon set',
  bundle: 'Bundle',
};

export const KIND_PLURALS: Record<PackageKind, string> = {
  app: 'Apps',
  font: 'Typefaces',
  icons: 'Icon sets',
  bundle: 'Bundles',
};

export const PRICE_LABELS: Record<PackagePrice, string> = {
  free: 'Free',
  subscription: 'Subscription',
};

/** The publisher a program that ships with the OS is listed under. */
export const SYSTEM_PUBLISHER = 'Lumen OS';

function bytesOf(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function fromManifest(manifest: AppManifest): Listing {
  return {
    id: manifest.id,
    kind: 'app',
    name: manifest.name,
    tagline: manifest.description ?? '',
    version: manifest.version ?? '',
    publisher: SYSTEM_PUBLISHER,
    category: manifest.category ?? 'utilities',
    size: bytesOf(formatManifest(manifest)),
    price: 'free',
    keywords: manifest.keywords ?? [],
    updated: '',
    origin: 'system',
    manifest,
  };
}

function fromSummary(summary: PackageSummary): Listing {
  return {
    id: summary.id,
    kind: summary.kind,
    name: summary.name,
    tagline: summary.tagline,
    version: summary.version,
    publisher: summary.publisher,
    category: summary.category,
    size: summary.size,
    price: summary.price,
    keywords: summary.keywords,
    updated: summary.updated,
    origin: 'store',
    manifest: null,
  };
}

/** The programs bundled with the OS, as listings. Computed once: they never change. */
export const SYSTEM_LISTINGS: readonly Listing[] = CATALOGUE.map(fromManifest);

/**
 * Everything on offer: the fetched catalogue first, then the programs that
 * ship with the system. A store package may not take a system program's id —
 * `store/FORMAT.md` rule 3 — so where one does, the copy inside the OS wins
 * and the download is dropped rather than shown twice.
 */
export function mergeListings(catalogue: Catalogue | null): Listing[] {
  const system = [...SYSTEM_LISTINGS];
  const taken = new Set(system.map((l) => l.id));
  const store = (catalogue?.packages ?? []).filter((p) => !taken.has(p.id)).map(fromSummary);
  return [...store, ...system];
}

export function listingsById(listings: readonly Listing[]): Map<string, Listing> {
  return new Map(listings.map((listing) => [listing.id, listing]));
}

/** The listings named by a section or collection, in its order, skipping ids it does not have. */
export function resolveIds(ids: readonly string[], index: ReadonlyMap<string, Listing>): Listing[] {
  const out: Listing[] = [];
  for (const id of ids) {
    const listing = index.get(id);
    if (listing && !out.includes(listing)) out.push(listing);
  }
  return out;
}

export interface ListingFilter {
  query?: string;
  /** A `PackageKind`, or 'all'. */
  kind?: string;
  /** A category id, or 'all'. */
  category?: string;
}

/** Name, tagline and keywords, plus the identifier, which is what a search for one is. */
export function listingMatches(listing: Listing, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return [listing.name, listing.id, listing.tagline, listing.publisher, ...listing.keywords].some(
    (field) => field.toLowerCase().includes(q),
  );
}

export function filterListings(
  listings: readonly Listing[],
  filter: ListingFilter = {},
): Listing[] {
  const kind = filter.kind ?? 'all';
  const category = filter.category ?? 'all';
  const query = filter.query ?? '';
  return listings.filter(
    (l) =>
      (kind === 'all' || l.kind === kind) &&
      (category === 'all' || l.category === category) &&
      listingMatches(l, query),
  );
}

export function isFiltered(filter: ListingFilter): boolean {
  return (
    (filter.query ?? '').trim().length > 0 ||
    (filter.kind ?? 'all') !== 'all' ||
    (filter.category ?? 'all') !== 'all'
  );
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** 'All kinds' first, then every kind present, with its count. */
export function kindOptions(listings: readonly Listing[]): FilterOption[] {
  const counts = new Map<PackageKind, number>();
  for (const l of listings) counts.set(l.kind, (counts.get(l.kind) ?? 0) + 1);
  const options: FilterOption[] = [
    { value: 'all', label: `All kinds (${listings.length})`, count: listings.length },
  ];
  for (const [kind, label] of Object.entries(KIND_PLURALS) as Array<[PackageKind, string]>) {
    const count = counts.get(kind);
    if (count) options.push({ value: kind, label: `${label} (${count})`, count });
  }
  return options;
}

/** A category id as the store writes it, in prose: `icon-sets` reads "Icon sets". */
export function categoryLabel(category: string): string {
  const words = category.replace(/[-_]/g, ' ').trim();
  if (words.length === 0) return 'Uncategorised';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function categoryOptions(listings: readonly Listing[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const l of listings) counts.set(l.category, (counts.get(l.category) ?? 0) + 1);
  const options: FilterOption[] = [
    { value: 'all', label: `All categories (${listings.length})`, count: listings.length },
  ];
  for (const [category, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    options.push({ value: category, label: `${categoryLabel(category)} (${count})`, count });
  }
  return options;
}

/** A row of tiles or a collection's list, with its listings already resolved. */
export interface Shelf {
  id: string;
  title: string;
  /** A collection says what it is for; a section is just a title. */
  tagline: string | null;
  artwork: Artwork | null;
  listings: Listing[];
}

function shelf(source: Section | Collection, index: ReadonlyMap<string, Listing>): Shelf {
  const collection = 'tagline' in source ? source : null;
  return {
    id: source.id,
    title: source.title,
    tagline: collection?.tagline ?? null,
    artwork: collection?.artwork ?? null,
    listings: resolveIds(source.packages, index),
  };
}

/** The catalogue's rows, in its order, with empty ones dropped. */
export function sectionShelves(
  catalogue: Catalogue | null,
  index: ReadonlyMap<string, Listing>,
): Shelf[] {
  return (catalogue?.sections ?? [])
    .map((s) => shelf(s, index))
    .filter((s) => s.listings.length > 0);
}

export function collectionShelves(
  catalogue: Catalogue | null,
  index: ReadonlyMap<string, Listing>,
): Shelf[] {
  return (catalogue?.collections ?? [])
    .map((c) => shelf(c, index))
    .filter((c) => c.listings.length > 0);
}

/**
 * The row the programs that ship with the OS are drawn in. It is always there,
 * with or without a network, which is the point of it.
 */
export function systemShelf(index: ReadonlyMap<string, Listing>): Shelf {
  return {
    id: 'system',
    title: 'Ships with Lumen OS',
    tagline: null,
    artwork: null,
    listings: resolveIds(
      SYSTEM_LISTINGS.map((l) => l.id),
      index,
    ),
  };
}

/**
 * `installed` — on the system already. `shadowed` — a built-in app owns the
 * id, so the OS would ignore anything installed under it. `available` — not
 * installed.
 */
export type ListingStatus = 'available' | 'installed' | 'shadowed';

export interface InstalledIndex {
  /** Everything the library knows: built-in apps and installed manifests. */
  entries: readonly LibraryEntry[];
  /** Ids of fonts and icon sets written by an earlier install. */
  resourceIds: readonly string[];
  /** A bundle counts as installed once every member is. */
  members?: ReadonlyMap<string, readonly string[]>;
}

export function listingStatus(listing: Listing, index: InstalledIndex): ListingStatus {
  if (listing.kind === 'bundle') {
    const members = index.members?.get(listing.id) ?? [];
    if (members.length === 0) return 'available';
    const statuses = members.map((id) => memberStatus(id, index));
    if (statuses.includes('shadowed')) return 'shadowed';
    return statuses.every((s) => s === 'installed') ? 'installed' : 'available';
  }
  return memberStatus(listing.id, index);
}

function memberStatus(id: string, index: InstalledIndex): ListingStatus {
  const entry = index.entries.find((e) => e.id === id);
  if (entry) return entry.source === 'built-in' ? 'shadowed' : 'installed';
  return index.resourceIds.includes(id) ? 'installed' : 'available';
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  available: 'Available',
  installed: 'Installed',
  shadowed: 'Shadowed by a built-in app',
};

/**
 * What a package says installing it allows, as a sentence. The store writes
 * these as ids; an id this OS does not know is printed as it stands rather
 * than guessed at, because inventing a meaning for it would be a claim about
 * something the system cannot check.
 */
const CAPABILITY_LABELS: Record<string, string> = {
  storage: 'Saves data of its own under your home directory.',
  notifications: 'Posts notifications.',
  clipboard: 'Reads and writes the clipboard.',
  fonts: 'Adds a typeface programs can set text in.',
  icons: 'Adds icons programs can draw.',
  network: 'Makes requests of its own.',
  files: 'Reads and writes files you choose.',
};

export function capabilityLabel(id: string): string | null {
  return CAPABILITY_LABELS[id] ?? null;
}

/** What a package needs of the system, in prose. */
export function requirementLine(os: string | null): string {
  return os === null ? 'Nothing in particular.' : `Lumen OS ${os}`;
}

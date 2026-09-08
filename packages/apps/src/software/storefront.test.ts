import { describe, expect, it } from 'vitest';
import { CATALOGUE } from './catalogue';
import { buildLibrary, type LibraryEntry } from './library';
import { parseCatalogue } from './remote';
import { catalogueJson, summary } from './remote/fixture';
import {
  capabilityLabel,
  categoryLabel,
  categoryOptions,
  collectionShelves,
  filterListings,
  isFiltered,
  kindOptions,
  type Listing,
  listingMatches,
  listingStatus,
  listingsById,
  mergeListings,
  requirementLine,
  resolveIds,
  SYSTEM_LISTINGS,
  SYSTEM_PUBLISHER,
  sectionShelves,
  systemShelf,
} from './storefront';

function catalogue(patch: Record<string, unknown> = {}) {
  const parsed = parseCatalogue(catalogueJson(patch));
  if (!parsed.ok) throw new Error(`fixture does not parse: ${JSON.stringify(parsed.problems)}`);
  return parsed.value;
}

const NO_ONE: LibraryEntry[] = [];

describe('the programs that ship with the OS', () => {
  it('are listed with the bytes the OS would write and no price', () => {
    expect(SYSTEM_LISTINGS).toHaveLength(CATALOGUE.length);
    for (const listing of SYSTEM_LISTINGS) {
      expect(listing.origin).toBe('system');
      expect(listing.kind).toBe('app');
      expect(listing.publisher).toBe(SYSTEM_PUBLISHER);
      expect(listing.price).toBe('free');
      expect(listing.size).toBeGreaterThan(400);
      expect(listing.manifest?.id).toBe(listing.id);
    }
  });

  it('are there with no catalogue at all', () => {
    const listings = mergeListings(null);
    expect(listings).toHaveLength(CATALOGUE.length);
    expect(listings.every((l) => l.origin === 'system')).toBe(true);
  });

  it('has a shelf of its own that survives an empty index', () => {
    expect(systemShelf(listingsById(mergeListings(null))).listings).toHaveLength(CATALOGUE.length);
    expect(systemShelf(new Map()).listings).toEqual([]);
  });
});

describe('mergeListings', () => {
  it('puts the store first and the system programs after it', () => {
    const listings = mergeListings(catalogue());
    expect(listings.slice(0, 2).map((l) => l.origin)).toEqual(['store', 'store']);
    expect(listings.at(-1)?.origin).toBe('system');
    expect(listings).toHaveLength(2 + CATALOGUE.length);
  });

  it('drops a store package that takes a system program id, keeping the copy in the OS', () => {
    const taken = CATALOGUE[0];
    if (!taken) throw new Error('empty catalogue');
    const listings = mergeListings(
      catalogue({ packages: [summary({ id: taken.id, name: 'Impostor' })] }),
    );
    const found = listings.filter((l) => l.id === taken.id);
    expect(found).toHaveLength(1);
    expect(found[0]?.origin).toBe('system');
    expect(found[0]?.name).toBe(taken.name);
  });
});

describe('filters', () => {
  const listings = mergeListings(catalogue());

  it('searches name, identifier, tagline, publisher and keywords', () => {
    const pomodoro = listings.find((l) => l.id === 'com.lumen.pomodoro') as Listing;
    expect(listingMatches(pomodoro, 'honest')).toBe(true);
    expect(listingMatches(pomodoro, 'TIMER')).toBe(true);
    expect(listingMatches(pomodoro, 'com.lumen.pom')).toBe(true);
    expect(listingMatches(pomodoro, 'Lumen')).toBe(true);
    expect(listingMatches(pomodoro, 'spreadsheet')).toBe(false);
    expect(listingMatches(pomodoro, '   ')).toBe(true);
  });

  it('narrows by kind and by category together', () => {
    const apps = filterListings(listings, { kind: 'app' });
    expect(apps.length).toBe(listings.length);
    expect(filterListings(listings, { kind: 'font' })).toEqual([]);
    expect(filterListings(listings, { category: 'utilities' }).length).toBeGreaterThan(0);
    expect(filterListings(listings, { category: 'utilities', query: 'zzz' })).toEqual([]);
  });

  it('knows when a filter is doing anything', () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ query: '  ', kind: 'all', category: 'all' })).toBe(false);
    expect(isFiltered({ query: 'a' })).toBe(true);
    expect(isFiltered({ kind: 'bundle' })).toBe(true);
    expect(isFiltered({ category: 'fonts' })).toBe(true);
  });

  it('counts what each option would show', () => {
    const kinds = kindOptions(listings);
    expect(kinds[0]).toEqual({
      value: 'all',
      label: `All kinds (${listings.length})`,
      count: listings.length,
    });
    expect(kinds.map((k) => k.value)).toEqual(['all', 'app']);
    const categories = categoryOptions(listings);
    expect(categories[0]?.value).toBe('all');
    expect(categories.map((c) => c.value)).toContain('utilities');
  });

  it('writes a category id as prose', () => {
    expect(categoryLabel('icon-sets')).toBe('Icon sets');
    expect(categoryLabel('utilities')).toBe('Utilities');
    expect(categoryLabel('')).toBe('Uncategorised');
  });
});

describe('shelves', () => {
  const index = listingsById(mergeListings(catalogue()));

  it('resolves a row in the order the catalogue wrote it and skips ids it lacks', () => {
    expect(
      resolveIds(['com.lumen.units', 'nope', 'com.lumen.pomodoro'], index).map((l) => l.id),
    ).toEqual(['com.lumen.units', 'com.lumen.pomodoro']);
    expect(resolveIds(['com.lumen.units', 'com.lumen.units'], index)).toHaveLength(1);
  });

  it('builds the sections and collections, dropping any that resolve to nothing', () => {
    const sections = sectionShelves(catalogue(), index);
    expect(sections.map((s) => s.id)).toEqual(['essentials']);
    expect(sections[0]?.artwork).toBeNull();
    const collections = collectionShelves(catalogue(), index);
    expect(collections[0]?.tagline).toBe('Programs that stay out of the way.');
    expect(collections[0]?.artwork?.shape).toBe('ramp');
    const empty = catalogue({ sections: [{ id: 'ghost', title: 'Ghost', packages: ['nobody'] }] });
    expect(sectionShelves(empty, index)).toEqual([]);
  });

  it('has no shelves at all without a catalogue', () => {
    expect(sectionShelves(null, index)).toEqual([]);
    expect(collectionShelves(null, index)).toEqual([]);
  });
});

describe('listingStatus', () => {
  const listings = mergeListings(catalogue());
  const pomodoro = listings.find((l) => l.id === 'com.lumen.pomodoro') as Listing;

  it('is available when nothing on the system claims the id', () => {
    expect(listingStatus(pomodoro, { entries: NO_ONE, resourceIds: [] })).toBe('available');
  });

  it('is installed once the manifest is under /Applications', () => {
    const entries = buildLibrary(
      [],
      [
        {
          manifest: { id: pomodoro.id, name: 'Pomodoro', html: '<p>x</p>' },
          path: '/Applications/Pomodoro.app',
        },
      ],
    );
    expect(listingStatus(pomodoro, { entries, resourceIds: [] })).toBe('installed');
  });

  it('is installed for a typeface once its file has been written', () => {
    const font: Listing = { ...pomodoro, id: 'com.lumen.font.seven', kind: 'font' };
    expect(listingStatus(font, { entries: NO_ONE, resourceIds: ['com.lumen.font.seven'] })).toBe(
      'installed',
    );
    expect(listingStatus(font, { entries: NO_ONE, resourceIds: [] })).toBe('available');
  });

  it('is shadowed when a built-in app owns the id', () => {
    const entries = buildLibrary(
      [
        {
          id: pomodoro.id,
          name: 'Pomodoro',
          description: '',
          category: 'utilities',
          icon: () => null,
          component: () => null,
          window: { width: 100, height: 100 },
        },
      ],
      [],
    );
    expect(listingStatus(pomodoro, { entries, resourceIds: [] })).toBe('shadowed');
  });

  it('calls a bundle installed only when every member is', () => {
    const bundle: Listing = { ...pomodoro, id: 'com.lumen.starter', kind: 'bundle' };
    const members = new Map([['com.lumen.starter', ['a', 'b']]]);
    expect(listingStatus(bundle, { entries: NO_ONE, resourceIds: ['a'], members })).toBe(
      'available',
    );
    expect(listingStatus(bundle, { entries: NO_ONE, resourceIds: ['a', 'b'], members })).toBe(
      'installed',
    );
    expect(listingStatus(bundle, { entries: NO_ONE, resourceIds: [] })).toBe('available');
  });
});

describe('capabilities and requirements', () => {
  it('says what a capability it knows allows, and nothing for one it does not', () => {
    expect(capabilityLabel('storage')).toBe('Saves data of its own under your home directory.');
    expect(capabilityLabel('telepathy')).toBeNull();
  });

  it('states the version of the OS a package asks for', () => {
    expect(requirementLine('>=0.1.0')).toBe('Lumen OS >=0.1.0');
    expect(requirementLine(null)).toBe('Nothing in particular.');
  });
});

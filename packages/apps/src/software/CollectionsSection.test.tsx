import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  CollectionsSection,
  type CollectionsSectionProps,
  collectionsEmptyLines,
  nextTile,
} from './CollectionsSection';
import type { InstallJob } from './installer';
import type { Artwork, Catalogue, Collection } from './remote';
import { type CatalogueView, emptyView } from './source';
import type { Listing } from './storefront';

const ADDRESS = 'https://store.lumen.example/shelf/';
const UPDATED = '2026-08-30T09:00:00Z';
const GRID: Artwork = { shape: 'grid', seed: 12, tone: 'neutral' };
const IDS = ['com.lumen.stopwatch', 'com.lumen.units', 'com.lumen.notes'];
const NAMES = ['Stopwatch', 'Units', 'Notes'];

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: IDS[0] ?? '',
    kind: 'app',
    name: 'Stopwatch',
    tagline: 'Laps and splits.',
    version: '2.1.0',
    publisher: 'Lumen',
    category: 'utilities',
    size: 4821,
    price: 'free',
    keywords: [],
    updated: UPDATED,
    origin: 'store',
    manifest: null,
    ...over,
  };
}

/** The three packages the fixture collection names, in its order. */
const LISTINGS: Listing[] = IDS.map((id, i) => listing({ id, name: NAMES[i] }));

function collection(over: Partial<Collection> = {}): Collection {
  return {
    id: 'quiet',
    title: 'Quiet tools',
    tagline: 'Programs that stay out of the way.',
    artwork: GRID,
    packages: IDS,
    ...over,
  };
}

function catalogue(over: Partial<Catalogue> = {}): Catalogue {
  return {
    format: 1,
    name: 'Lumen Store',
    updated: UPDATED,
    packages: [],
    sections: [],
    banners: [],
    collections: [],
    ...over,
  };
}

/** A settled view with nothing fetched. */
function view(over: Partial<CatalogueView> = {}): CatalogueView {
  return { ...emptyView(ADDRESS), loading: false, ...over };
}

/** A view holding a catalogue that came over the network. */
function fetched(over: Partial<Catalogue> = {}): CatalogueView {
  return view({ catalogue: catalogue(over), base: ADDRESS, origin: 'network', fetchedAt: 0 });
}

function mount(over: Partial<CollectionsSectionProps> = {}) {
  const onOpen = vi.fn();
  const onRefresh = vi.fn();
  render(
    <CollectionsSection
      view={fetched({ collections: [collection()] })}
      listings={LISTINGS}
      statusOf={() => 'available'}
      jobs={[]}
      onOpen={onOpen}
      onRefresh={onRefresh}
      {...over}
    />,
  );
  return { onOpen, onRefresh };
}

function tile(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(name) });
}

describe('a collection', () => {
  it('is drawn with the title, tagline and artwork the catalogue gives it', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Quiet tools' })).toBeInTheDocument();
    expect(screen.getByText('Programs that stay out of the way.')).toBeInTheDocument();
    expect(screen.getByTitle('Drawn artwork: a grid of squares.')).toBeInTheDocument();
  });

  it('counts the packages it actually resolved', () => {
    mount();
    expect(screen.getByText('3 packages')).toBeInTheDocument();
  });

  it('drops an id the catalogue does not list, and says so in the count', () => {
    mount({
      view: fetched({ collections: [collection({ packages: [...IDS, 'com.lumen.gone'] })] }),
    });
    expect(screen.getByText('3 packages')).toBeInTheDocument();
  });

  it('counts one package as one', () => {
    mount({ view: fetched({ collections: [collection({ packages: [IDS[0] ?? ''] })] }) });
    expect(screen.getByText('1 package')).toBeInTheDocument();
  });

  it('names its region so the row belongs to it', () => {
    mount();
    expect(screen.getByRole('region', { name: 'Quiet tools' })).toBeInTheDocument();
  });
});

describe('the row of packages', () => {
  it('draws a tile a package, in the collection’s order', () => {
    mount();
    for (const name of NAMES) expect(tile(name)).toBeInTheDocument();
  });

  it('hands a package id back rather than opening anything itself', async () => {
    const { onOpen } = mount();
    await userEvent.click(tile('Units'));
    expect(onOpen).toHaveBeenCalledWith('com.lumen.units');
  });

  it('says which tile is being installed', () => {
    const job: InstallJob = {
      id: 'com.lumen.units',
      name: 'Units',
      bundle: false,
      rows: [],
      state: 'running',
      message: null,
    };
    mount({ jobs: [job] });
    expect(tile('Units')).toHaveTextContent('Installing');
  });

  it('moves along with the arrow keys', async () => {
    mount();
    tile('Stopwatch').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tile('Units')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(tile('Stopwatch')).toHaveFocus();
  });

  it('goes to either end with Home and End', async () => {
    mount();
    tile('Stopwatch').focus();
    await userEvent.keyboard('{End}');
    expect(tile('Notes')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(tile('Stopwatch')).toHaveFocus();
  });

  it('stops at the end rather than wrapping round', async () => {
    mount();
    tile('Notes').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tile('Notes')).toHaveFocus();
  });
});

describe('where a key lands', () => {
  it('steps one either way', () => {
    expect(nextTile('ArrowRight', 0, 3)).toBe(1);
    expect(nextTile('ArrowLeft', 2, 3)).toBe(1);
  });

  it('takes Home and End to the ends', () => {
    expect(nextTile('Home', 2, 3)).toBe(0);
    expect(nextTile('End', 0, 3)).toBe(2);
  });

  it('stays put at either end', () => {
    expect(nextTile('ArrowRight', 2, 3)).toBeNull();
    expect(nextTile('ArrowLeft', 0, 3)).toBeNull();
  });

  it('leaves every other key alone', () => {
    expect(nextTile('ArrowDown', 0, 3)).toBeNull();
    expect(nextTile('a', 0, 3)).toBeNull();
  });
});

describe('when there is nothing to show', () => {
  it('says the fetch is still running', () => {
    mount({ view: view({ loading: true }) });
    expect(screen.getByText(/Fetching the catalogue/)).toBeInTheDocument();
  });

  it('names the address it asked, and offers another go', async () => {
    const { onRefresh } = mount({ view: view() });
    expect(screen.getByText('No catalogue yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('tells a catalogue that groups nothing from one whose groups are broken', () => {
    expect(collectionsEmptyLines(fetched()).description).toContain(`${ADDRESS} groups none`);
    expect(
      collectionsEmptyLines(
        fetched({ collections: [collection({ packages: ['com.lumen.gone'] })] }),
      ).description,
    ).toBe(`The one collection at ${ADDRESS} names packages the catalogue does not list.`);
  });

  it('counts the collections it could not draw', () => {
    const broken = fetched({
      collections: [
        collection({ packages: ['com.lumen.gone'] }),
        collection({ id: 'loud', packages: ['com.lumen.gone'] }),
      ],
    });
    expect(collectionsEmptyLines(broken).description).toBe(
      `The 2 collections at ${ADDRESS} name packages the catalogue does not list.`,
    );
  });

  it('offers no refresh once a catalogue is in hand', () => {
    mount({ view: fetched() });
    expect(screen.getByText('No collections')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

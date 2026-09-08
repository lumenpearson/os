import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CategoriesSection, type CategoriesSectionProps, categoryFaces } from './CategoriesSection';
import type { Artwork, Banner, Catalogue, Collection } from './remote';
import { type CatalogueView, emptyView } from './source';
import type { Listing } from './storefront';

const ADDRESS = 'https://store.lumen.example/shelf/';
const UPDATED = '2026-08-30T09:00:00Z';
const RINGS: Artwork = { shape: 'rings', seed: 7, tone: 'accent' };
const GRID: Artwork = { shape: 'grid', seed: 12, tone: 'neutral' };

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: 'com.lumen.stopwatch',
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

function banner(over: Partial<Banner> = {}): Banner {
  return {
    id: 'welcome',
    title: 'Two programs to start with',
    text: 'A stopwatch and the face it prints in.',
    target: { kind: 'package', id: 'com.lumen.stopwatch' },
    artwork: RINGS,
    ...over,
  };
}

function collection(over: Partial<Collection> = {}): Collection {
  return {
    id: 'quiet',
    title: 'Quiet tools',
    tagline: 'Programs that stay out of the way.',
    artwork: GRID,
    packages: ['com.lumen.stopwatch'],
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

function mount(over: Partial<CategoriesSectionProps> = {}) {
  const onCategory = vi.fn();
  const onRefresh = vi.fn();
  render(
    <CategoriesSection
      view={fetched()}
      listings={[listing()]}
      compact={false}
      onCategory={onCategory}
      onRefresh={onRefresh}
      {...over}
    />,
  );
  return { onCategory, onRefresh };
}

describe('the cards', () => {
  it('draws one a category, counting the listings in it', () => {
    mount({
      listings: [
        listing(),
        listing({ id: 'com.lumen.units', name: 'Units' }),
        listing({ id: 'com.lumen.font.seven', name: 'Seven', category: 'fonts' }),
      ],
    });
    expect(screen.getByRole('button', { name: /Utilities/ })).toHaveTextContent('2 packages');
    expect(screen.getByRole('button', { name: /Fonts/ })).toHaveTextContent('1 package');
  });

  it('leaves out the All option, which is a filter rather than a category', () => {
    mount();
    expect(screen.queryByRole('button', { name: /All categories/ })).not.toBeInTheDocument();
  });

  it('hands the choice back instead of filtering anything itself', async () => {
    const { onCategory } = mount();
    await userEvent.click(screen.getByRole('button', { name: /Utilities/ }));
    expect(onCategory).toHaveBeenCalledWith('utilities');
  });

  it('faces a card only where the catalogue has a drawing for it', () => {
    mount({
      view: fetched({ banners: [banner()] }),
      listings: [listing(), listing({ id: 'com.lumen.font.seven', category: 'fonts' })],
    });
    expect(screen.getAllByTitle(/^Drawn artwork/)).toHaveLength(1);
    expect(screen.getByTitle('Drawn artwork: concentric rings.')).toBeInTheDocument();
  });
});

describe('the face a category borrows', () => {
  it('takes it from a banner pointing straight at one of its packages', () => {
    const faces = categoryFaces(catalogue({ banners: [banner()] }), [listing()]);
    expect(faces.get('utilities')).toBe(RINGS);
  });

  it('falls back to a collection that lists one', () => {
    const faces = categoryFaces(catalogue({ collections: [collection()] }), [listing()]);
    expect(faces.get('utilities')).toBe(GRID);
  });

  it('prefers the banner, which names one package rather than a set', () => {
    const faces = categoryFaces(catalogue({ banners: [banner()], collections: [collection()] }), [
      listing(),
    ]);
    expect(faces.get('utilities')).toBe(RINGS);
  });

  it('ignores a banner that points at a section rather than a package', () => {
    const targeted = banner({ target: { kind: 'section', id: 'essentials' } });
    const faces = categoryFaces(catalogue({ banners: [targeted] }), [listing()]);
    expect(faces.size).toBe(0);
  });

  it('ignores a target the catalogue does not list', () => {
    const targeted = banner({ target: { kind: 'package', id: 'com.lumen.absent' } });
    const faces = categoryFaces(catalogue({ banners: [targeted] }), [listing()]);
    expect(faces.size).toBe(0);
  });

  it('gives no face at all when there is no catalogue', () => {
    expect(categoryFaces(null, [listing()]).size).toBe(0);
  });
});

describe('when no catalogue arrived', () => {
  it('says the fetch is still running', () => {
    mount({ view: view({ loading: true }), listings: [] });
    expect(screen.getByText(/Fetching the catalogue/)).toBeInTheDocument();
  });

  it('names the address it asked, and offers another go', async () => {
    const { onRefresh } = mount({ view: view(), listings: [] });
    expect(screen.getByText('No catalogue yet')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(ADDRESS))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('says whose categories are still on screen', () => {
    mount({ view: view(), listings: [listing({ origin: 'system' })] });
    expect(screen.getByText(/programs that ship with Lumen OS/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Utilities/ })).toBeInTheDocument();
  });

  it('does not claim categories are below when none are', () => {
    mount({ view: view(), listings: [] });
    expect(screen.queryByText(/programs that ship with Lumen OS/)).not.toBeInTheDocument();
  });
});

describe('when the catalogue lists no packages', () => {
  it('says so, and says where it looked', () => {
    mount({ view: fetched(), listings: [] });
    expect(screen.getByText('No categories')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${ADDRESS} lists no packages`))).toBeInTheDocument();
  });
});

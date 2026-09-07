/**
 * Every category the catalogue sorts its packages into, as cards.
 *
 * The number on a card is the one `categoryOptions` counts off the listings in
 * hand, so a card never claims more than the store is actually offering.
 * Choosing one is handed back to the window rather than acted on here: a
 * category is a filter over the shelves, and Discover is the section that
 * draws filtered shelves.
 */

import { Button, cx, EmptyState, Spinner } from '@lumen/ui';
import { Grid2x2, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { ArtworkFill } from './ArtworkPanel';
import type { Artwork, Catalogue } from './remote';
import { type CatalogueView, emptyLines } from './source';
import { categoryLabel, categoryOptions, type FilterOption, type Listing } from './storefront';

/**
 * The drawing a category is faced with.
 *
 * A package summary carries no artwork of its own — in `remote/types.ts` only
 * a banner and a collection do — so a category borrows the recipe of the first
 * thing in the catalogue that names one of its packages: a banner pointing
 * straight at one, failing that a collection listing one. A category nothing
 * points at gets no face, because a seed invented here would be a drawing the
 * store never published.
 */
export function categoryFaces(
  catalogue: Catalogue | null,
  listings: readonly Listing[],
): Map<string, Artwork> {
  const categoryOf = new Map(listings.map((listing) => [listing.id, listing.category]));
  const faces = new Map<string, Artwork>();
  const claim = (id: string, artwork: Artwork) => {
    const category = categoryOf.get(id);
    if (category !== undefined && !faces.has(category)) faces.set(category, artwork);
  };
  for (const banner of catalogue?.banners ?? []) {
    if (banner.target.kind === 'package') claim(banner.target.id, banner.artwork);
  }
  for (const collection of catalogue?.collections ?? []) {
    for (const id of collection.packages) claim(id, collection.artwork);
  }
  return faces;
}

function packageCount(count: number): string {
  return count === 1 ? '1 package' : `${count} packages`;
}

function CategoryCard({
  option,
  artwork,
  onSelect,
}: {
  option: FilterOption;
  artwork: Artwork | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        // A card gets its own corner and its own depth: --radius-2xl, and
        // --shadow-card for the hairline plus one colourless drop, which is
        // why there is no second border here. Clipping is what holds the
        // drawing inside that corner.
        // deslop-ignore-next-line 21 22
        'relative overflow-hidden rounded-2xl bg-surface text-left shadow-card lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-surface-2',
      )}
    >
      {artwork && (
        <span className="pointer-events-none absolute inset-0">
          <ArtworkFill artwork={artwork} />
        </span>
      )}
      <span className="relative flex min-h-24 flex-col justify-end gap-1 p-4">
        <span className="text-md font-medium text-ink">{categoryLabel(option.value)}</span>
        <span className="mono text-2xs text-ink-3 tabular-nums">{packageCount(option.count)}</span>
      </span>
    </button>
  );
}

/**
 * Nothing was fetched, and which address was asked.
 *
 * The cards below this block are still real — the programs that ship inside
 * the OS are listed with or without a network — so when any are left it says
 * whose categories they are, rather than letting five built-in programs read
 * as the whole store.
 */
function CatalogueMissing({
  view,
  remaining,
  onRefresh,
}: {
  view: CatalogueView;
  remaining: number;
  onRefresh: () => void;
}) {
  const lines = emptyLines(view);
  return (
    <section className="flex flex-col items-start gap-2 rounded-md border border-rule bg-canvas p-4">
      <h2 className="text-md font-medium text-ink">{lines.title}</h2>
      <p className="max-w-2xl text-base text-ink-2">{lines.description}</p>
      {remaining > 0 && (
        <p className="max-w-2xl text-base text-ink-2">
          The categories below are the ones the programs that ship with Lumen OS fall into.
        </p>
      )}
      <Button size="sm" icon={<RefreshCw />} onClick={onRefresh}>
        Try again
      </Button>
    </section>
  );
}

export interface CategoriesSectionProps {
  view: CatalogueView;
  /** The catalogue and the built-in programs, merged — the same list Discover filters. */
  listings: readonly Listing[];
  /** True when the window is too narrow for a row of cards. */
  compact: boolean;
  /** The chosen category, for Discover to filter on. */
  onCategory: (category: string) => void;
  onRefresh: () => void;
}

export function CategoriesSection({
  view,
  listings,
  compact,
  onCategory,
  onRefresh,
}: CategoriesSectionProps) {
  // `categoryOptions` leads with the 'all' option the Discover toolbar needs;
  // a card reading "All categories" would be a card that is not a category.
  const categories = useMemo(
    () => categoryOptions(listings).filter((option) => option.value !== 'all'),
    [listings],
  );
  const faces = useMemo(() => categoryFaces(view.catalogue, listings), [view.catalogue, listings]);
  const fetching = view.loading && view.catalogue === null;

  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="flex flex-col gap-6 px-4 py-4">
        {fetching && (
          <p className="flex items-center gap-2 text-base text-ink-2">
            <Spinner size={14} /> Fetching the catalogue…
          </p>
        )}

        {!fetching && view.catalogue === null && (
          <CatalogueMissing view={view} remaining={categories.length} onRefresh={onRefresh} />
        )}

        {categories.length === 0 && view.catalogue !== null && (
          <EmptyState
            icon={<Grid2x2 />}
            title="No categories"
            description={`The catalogue at ${view.base ?? view.address} lists no packages to sort into categories.`}
          />
        )}

        {categories.length > 0 && (
          <div
            className={cx(
              'grid gap-3',
              compact
                ? 'grid-cols-1'
                : '[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]',
            )}
          >
            {categories.map((option) => (
              <CategoryCard
                key={option.value}
                option={option}
                artwork={faces.get(option.value)}
                onSelect={() => onCategory(option.value)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

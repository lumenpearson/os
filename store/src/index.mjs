/**
 * The catalogue in authored form.
 *
 * `scripts/build-store.mjs` imports this module, validates what it finds, and
 * writes `index.json`, `packages/<id>.json`, `payload/<id>-<version>.json` and
 * `banner/<id>.json` beside it. Nothing here computes a size or a digest: those
 * are properties of the emitted bytes, so only the build can know them.
 */

import { APPS } from './apps/index.mjs';
import { BUNDLES } from './bundles.mjs';
import { FONTS } from './fonts/index.mjs';
import { ICON_SETS } from './icons/index.mjs';
import { BANNERS, COLLECTIONS, SECTIONS } from './storefront.mjs';

/** Bumped only for a change that an older client could not read. */
export const FORMAT_VERSION = 1;

export const STORE_NAME = 'Lumen Store';

/**
 * The catalogue's own timestamp. It is written down rather than read from the
 * clock so that two builds of the same source produce the same bytes; move it
 * when the catalogue changes.
 */
export const UPDATED = '2026-09-05T00:00:00Z';

export const PACKAGES = [...APPS, ...FONTS, ...ICON_SETS, ...BUNDLES];

export { BANNERS, COLLECTIONS, SECTIONS };

/**
 * The documents a Lumen store serves, as TypeScript.
 *
 * The wire format is `store/FORMAT.md`; this file is that document typed and
 * nothing else. Where FORMAT.md leaves a field out, the parsers in `parse.ts`
 * normalise it here to `null` or `[]`, so nothing downstream has to ask twice
 * whether a field is absent or empty. A store is fetched over the network, so
 * every value in these types has been checked by `parse.ts` before it exists.
 */

import type { AppManifest } from '@lumen/kernel';

/**
 * The `format` number this client reads. A document declaring a higher one is
 * refused whole: `format` is bumped only for a breaking change, so a newer
 * document means fields this client would misread.
 */
export const CATALOGUE_FORMAT = 1;

export const PACKAGE_KINDS = ['app', 'font', 'icons', 'bundle'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

/** Every kind but `bundle` carries a payload file of its own. */
export type PayloadKind = Exclude<PackageKind, 'bundle'>;

export const PACKAGE_PRICES = ['free', 'subscription'] as const;
export type PackagePrice = (typeof PACKAGE_PRICES)[number];

export const ARTWORK_SHAPES = ['rings', 'grid', 'ramp', 'type'] as const;
export type ArtworkShape = (typeof ARTWORK_SHAPES)[number];

export const ARTWORK_TONES = ['accent', 'neutral'] as const;
export type ArtworkTone = (typeof ARTWORK_TONES)[number];

export const BANNER_TARGET_KINDS = ['package', 'section', 'collection'] as const;
export type BannerTargetKind = (typeof BANNER_TARGET_KINDS)[number];

/** Artwork is a recipe drawn with the system's own tokens, never an image. */
export interface Artwork {
  shape: ArtworkShape;
  seed: number;
  tone: ArtworkTone;
}

/** The fields a storefront tile needs, and no more. */
export interface PackageSummary {
  id: string;
  kind: PackageKind;
  name: string;
  tagline: string;
  version: string;
  publisher: string;
  category: string;
  /** Payload bytes, exact. Checked against what arrives. */
  size: number;
  price: PackagePrice;
  keywords: string[];
  /** ISO 8601 timestamp. */
  updated: string;
}

/** What a package needs of the system it installs onto. */
export interface PackageRequirements {
  /** A range such as `>=0.1.0`, or null when the package states none. */
  os: string | null;
}

interface PackageCommon extends PackageSummary {
  description: string;
  requires: PackageRequirements;
  /** What installing it allows, as capability ids. */
  capabilities: string[];
  screenshots: Artwork[];
  releaseNotes: string | null;
}

/** A package with bytes to download: kind `app`, `font` or `icons`. */
export interface PayloadPackage extends PackageCommon {
  kind: PayloadKind;
  /** Path to the payload file, relative to the store's base URL. */
  payload: string;
  /** sha256 of the payload file's bytes, lowercase hex. */
  sha256: string;
}

/** A package that installs other packages and has no bytes of its own. */
export interface BundlePackage extends PackageCommon {
  kind: 'bundle';
  members: string[];
}

export type PackageDocument = PayloadPackage | BundlePackage;

/** A row of tiles on the storefront. */
export interface Section {
  id: string;
  title: string;
  packages: string[];
}

/** A card that opens a list. */
export interface Collection extends Section {
  tagline: string;
  artwork: Artwork;
}

export interface BannerTarget {
  kind: BannerTargetKind;
  id: string;
}

/** A wide card at the top of the storefront. Also served at `banner/<id>.json`. */
export interface Banner {
  id: string;
  title: string;
  text: string;
  target: BannerTarget;
  artwork: Artwork;
}

/** `index.json`: everything the storefront draws before anything is opened. */
export interface Catalogue {
  format: number;
  name: string;
  updated: string;
  packages: PackageSummary[];
  sections: Section[];
  banners: Banner[];
  collections: Collection[];
}

export interface FontFace {
  weight: number;
  style: 'normal' | 'italic';
  /** A `data:` URL, so a font never needs a second request. */
  src: string;
}

export interface FontResource {
  family: string;
  faces: FontFace[];
}

export interface IconsResource {
  prefix: string;
  /** Icon name to SVG path data. */
  icons: Record<string, string>;
}

/** `payload/<id>-<version>.json`, once read according to the package's kind. */
export type PayloadDocument =
  | { kind: 'app'; manifest: AppManifest }
  | { kind: 'font'; font: FontResource }
  | { kind: 'icons'; icons: IconsResource };

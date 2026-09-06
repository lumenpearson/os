/**
 * Test data: the documents of `store/FORMAT.md` as the JSON a store serves,
 * plus the typed values a caller holds once they have been read. Every builder
 * takes a patch, so a test can break exactly one field and leave the rest
 * valid. Only the tests import this file.
 */

import type { Artwork, BundlePackage, PackageSummary, PayloadPackage } from './types';

export const STORE_BASE = 'https://store.lumen.example/shelf';
export const POMODORO = 'com.lumen.pomodoro';
export const UPDATED = '2026-09-05T00:00:00Z';

/** A well-shaped digest for documents whose bytes no test actually fetches. */
export const SOME_DIGEST = '9f'.repeat(32);

type Json = Record<string, unknown>;

export function artworkJson(patch: Json = {}): Json {
  return { shape: 'rings', seed: 7, tone: 'accent', ...patch };
}

export function summaryJson(patch: Json = {}): Json {
  return {
    id: POMODORO,
    kind: 'app',
    name: 'Pomodoro',
    tagline: 'A timer that keeps the hour honest.',
    version: '1.2.0',
    publisher: 'Lumen',
    category: 'utilities',
    size: 4821,
    price: 'free',
    keywords: ['timer'],
    updated: UPDATED,
    ...patch,
  };
}

export function packageJson(patch: Json = {}): Json {
  return {
    ...summaryJson(),
    description: 'A timer for one thing at a time.',
    payload: `payload/${POMODORO}-1.2.0.json`,
    sha256: SOME_DIGEST,
    requires: { os: '>=0.1.0' },
    capabilities: ['storage'],
    screenshots: [artworkJson()],
    releaseNotes: 'Keeps counting when the window is closed.',
    ...patch,
  };
}

export function bundleJson(patch: Json = {}): Json {
  return {
    ...summaryJson({ id: 'com.lumen.starter', kind: 'bundle', name: 'Starter set', size: 0 }),
    description: 'Five programs to start with.',
    members: [POMODORO, 'com.lumen.units'],
    ...patch,
  };
}

export function bannerJson(patch: Json = {}): Json {
  return {
    id: 'welcome',
    title: 'Five programs to start with',
    text: 'The set most people install first.',
    target: { kind: 'collection', id: 'essentials' },
    artwork: artworkJson({ shape: 'grid', seed: 3, tone: 'neutral' }),
    ...patch,
  };
}

export function catalogueJson(patch: Json = {}): Json {
  return {
    format: 1,
    name: 'Lumen Store',
    updated: UPDATED,
    packages: [summaryJson(), summaryJson({ id: 'com.lumen.units', name: 'Units' })],
    sections: [{ id: 'essentials', title: 'Essentials', packages: [POMODORO] }],
    banners: [bannerJson()],
    collections: [
      {
        id: 'quiet',
        title: 'Quiet tools',
        tagline: 'Programs that stay out of the way.',
        artwork: artworkJson({ shape: 'ramp' }),
        packages: [POMODORO],
      },
    ],
    ...patch,
  };
}

export function appPayloadJson(patch: Json = {}): Json {
  return {
    id: POMODORO,
    name: 'Pomodoro',
    version: '1.2.0',
    description: 'A timer that keeps the hour honest.',
    html: '<p>25:00</p>',
    ...patch,
  };
}

export function fontPayloadJson(patch: Json = {}): Json {
  return {
    family: 'Lumen Text',
    faces: [{ weight: 400, style: 'normal', src: 'data:font/woff2;base64,d09GMg==' }],
    ...patch,
  };
}

export function iconsPayloadJson(patch: Json = {}): Json {
  return {
    prefix: 'weather',
    icons: { rain: 'M4 4 L20 20', sun: 'M12 4 a8 8 0 1 0 0.1 0 Z' },
    ...patch,
  };
}

export const ARTWORK: Artwork = { shape: 'rings', seed: 7, tone: 'accent' };

/** The typed summary a catalogue hands to the storefront. */
export function summary(patch: Partial<PackageSummary> = {}): PackageSummary {
  return {
    id: POMODORO,
    kind: 'app',
    name: 'Pomodoro',
    tagline: 'A timer that keeps the hour honest.',
    version: '1.2.0',
    publisher: 'Lumen',
    category: 'utilities',
    size: 4821,
    price: 'free',
    keywords: ['timer'],
    updated: UPDATED,
    ...patch,
  };
}

export function payloadPackage(patch: Partial<PayloadPackage> = {}): PayloadPackage {
  return {
    ...summary(),
    kind: 'app',
    description: 'A timer for one thing at a time.',
    payload: `payload/${POMODORO}-1.2.0.json`,
    sha256: SOME_DIGEST,
    requires: { os: '>=0.1.0' },
    capabilities: ['storage'],
    screenshots: [ARTWORK],
    releaseNotes: null,
    ...patch,
  };
}

export function bundlePackage(patch: Partial<BundlePackage> = {}): BundlePackage {
  return {
    ...summary({ id: 'com.lumen.starter', name: 'Starter set', size: 0 }),
    kind: 'bundle',
    description: 'Five programs to start with.',
    members: [POMODORO, 'com.lumen.units'],
    requires: { os: null },
    capabilities: [],
    screenshots: [],
    releaseNotes: null,
    ...patch,
  };
}

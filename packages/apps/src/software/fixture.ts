/**
 * A whole store, served to the window's tests through a stubbed `fetch`.
 *
 * `remote/fixture.ts` holds single documents for the client's own tests; this
 * is the set of files a base URL actually serves — an index, a package file
 * each, and the payloads those name — with the sizes and digests computed from
 * the bytes, because that is what the client checks them against. Only the
 * tests import it.
 */

const encoder = new TextEncoder();

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

export const STOPWATCH = 'com.lumen.stopwatch';
export const SEVEN = 'com.lumen.font.seven';
export const DESK = 'com.lumen.bundle.desk';
export const UPDATED = '2026-08-30T09:00:00Z';

type Json = Record<string, unknown>;

export const STOPWATCH_MANIFEST = {
  id: STOPWATCH,
  name: 'Stopwatch',
  version: '2.1.0',
  description: 'A stopwatch that keeps counting with the window closed.',
  category: 'utilities',
  keywords: ['time', 'laps'],
  html: '<p>00:00.00</p>',
};

export const SEVEN_FONT = {
  family: 'Lumen Seven',
  faces: [{ weight: 400, style: 'normal', src: 'data:font/ttf;base64,AAEAAAAK' }],
};

/** Every file the store serves, by URL. */
export type StoreFiles = Map<string, string>;

export interface TestStore {
  files: StoreFiles;
  /** The payload documents, so a test can corrupt one. */
  payloads: { stopwatch: string; seven: string };
}

function summary(patch: Json): Json {
  return {
    publisher: 'Lumen',
    price: 'free',
    keywords: [],
    updated: UPDATED,
    ...patch,
  };
}

/** The catalogue and the files it names, all consistent with one another. */
export async function buildStore(base: string): Promise<TestStore> {
  const stopwatchPayload = JSON.stringify(STOPWATCH_MANIFEST);
  const sevenPayload = JSON.stringify(SEVEN_FONT);

  const stopwatchSummary = summary({
    id: STOPWATCH,
    kind: 'app',
    name: 'Stopwatch',
    tagline: 'Laps, splits and a total that keeps running.',
    version: '2.1.0',
    category: 'utilities',
    size: byteLength(stopwatchPayload),
    keywords: ['time', 'laps'],
  });
  const sevenSummary = summary({
    id: SEVEN,
    kind: 'font',
    name: 'Seven Segment',
    tagline: 'A face drawn from seven bars.',
    version: '1.0.0',
    category: 'fonts',
    size: byteLength(sevenPayload),
    keywords: ['font', 'display'],
  });
  const deskSummary = summary({
    id: DESK,
    kind: 'bundle',
    name: 'Desk Kit',
    tagline: 'The stopwatch and the face it prints in.',
    version: '1.0.0',
    category: 'bundles',
    size: 0,
    keywords: ['bundle'],
  });

  const index = {
    format: 1,
    name: 'Lumen Store',
    updated: UPDATED,
    packages: [stopwatchSummary, sevenSummary, deskSummary],
    sections: [{ id: 'recent', title: 'Recently updated', packages: [STOPWATCH, SEVEN, DESK] }],
    banners: [
      {
        id: 'welcome',
        title: 'Two programs to start with',
        text: 'A stopwatch and the face it prints in.',
        target: { kind: 'collection', id: 'quiet' },
        artwork: { shape: 'rings', seed: 3, tone: 'accent' },
      },
    ],
    collections: [
      {
        id: 'quiet',
        title: 'Quiet tools',
        tagline: 'Programs that stay out of the way.',
        artwork: { shape: 'grid', seed: 12, tone: 'neutral' },
        packages: [STOPWATCH],
      },
    ],
  };

  const stopwatchDocument = {
    ...stopwatchSummary,
    description: 'A stopwatch with laps.\n\nIt keeps counting when the window is closed.',
    payload: `payload/${STOPWATCH}-2.1.0.json`,
    sha256: await sha256(stopwatchPayload),
    requires: { os: '>=0.1.0' },
    capabilities: ['storage'],
    screenshots: [{ shape: 'ramp', seed: 9, tone: 'neutral' }],
    releaseNotes: 'Laps now survive a reload.',
  };
  const sevenDocument = {
    ...sevenSummary,
    description: 'Seven bars per digit, drawn rather than photographed.',
    payload: `payload/${SEVEN}-1.0.0.json`,
    sha256: await sha256(sevenPayload),
    requires: { os: null },
    capabilities: ['fonts'],
    screenshots: [],
    releaseNotes: null,
  };
  const deskDocument = {
    ...deskSummary,
    description: 'Both of them, in one install.',
    requires: { os: null },
    capabilities: [],
    screenshots: [],
    releaseNotes: null,
    members: [STOPWATCH, SEVEN],
  };

  const files: StoreFiles = new Map([
    [`${base}index.json`, JSON.stringify(index)],
    [`${base}packages/${STOPWATCH}.json`, JSON.stringify(stopwatchDocument)],
    [`${base}packages/${SEVEN}.json`, JSON.stringify(sevenDocument)],
    [`${base}packages/${DESK}.json`, JSON.stringify(deskDocument)],
    [`${base}payload/${STOPWATCH}-2.1.0.json`, stopwatchPayload],
    [`${base}payload/${SEVEN}-1.0.0.json`, sevenPayload],
  ]);

  return { files, payloads: { stopwatch: stopwatchPayload, seven: sevenPayload } };
}

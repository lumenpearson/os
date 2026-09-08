/**
 * How the catalogue is arranged: the rows, the cards and the wide banners.
 *
 * Every id named here is checked against the package list at build time, so a
 * renamed or withdrawn package fails the build rather than leaving a hole in
 * the storefront.
 */

/** Rows of tiles, drawn in this order. */
export const SECTIONS = [
  {
    id: 'recently-updated',
    title: 'Recently updated',
    packages: [
      'com.lumen.timestamp',
      'com.lumen.ids',
      'com.lumen.contrast',
      'com.lumen.csv',
      'com.lumen.bundle.developer',
      'com.lumen.metronome',
    ],
  },
  {
    id: 'developer-tools',
    title: 'For developers',
    packages: [
      'com.lumen.regex',
      'com.lumen.diff',
      'com.lumen.encoder',
      'com.lumen.cron',
      'com.lumen.ids',
      'com.lumen.timestamp',
    ],
  },
  {
    id: 'text-and-data',
    title: 'Text and data',
    packages: ['com.lumen.csv', 'com.lumen.words', 'com.lumen.diff', 'com.lumen.encoder'],
  },
  {
    id: 'drawing',
    title: 'Drawing and colour',
    packages: ['com.lumen.contrast', 'com.lumen.bezier', 'com.lumen.icons.studio'],
  },
  {
    id: 'time-and-rhythm',
    title: 'Time and rhythm',
    packages: ['com.lumen.stopwatch', 'com.lumen.metronome', 'com.lumen.timestamp'],
  },
  {
    id: 'typefaces',
    title: 'Typefaces',
    packages: [
      'com.lumen.font.plex-italic',
      'com.lumen.font.mono-italic',
      'com.lumen.font.seven',
      'com.lumen.font.blocks',
    ],
  },
  {
    id: 'icon-sets',
    title: 'Icon sets',
    packages: ['com.lumen.icons.weather', 'com.lumen.icons.transit', 'com.lumen.icons.studio'],
  },
  {
    id: 'bundles',
    title: 'Bundles',
    packages: ['com.lumen.bundle.developer', 'com.lumen.bundle.design', 'com.lumen.bundle.desk'],
  },
];

/** Cards that open a list of their own. */
export const COLLECTIONS = [
  {
    id: 'essentials',
    title: 'Start here',
    tagline: 'Six programs that earn their place on the first day.',
    artwork: { shape: 'rings', seed: 3, tone: 'accent' },
    packages: [
      'com.lumen.regex',
      'com.lumen.diff',
      'com.lumen.csv',
      'com.lumen.encoder',
      'com.lumen.stopwatch',
      'com.lumen.timestamp',
    ],
  },
  {
    id: 'the-drawing-desk',
    title: 'The drawing desk',
    tagline: 'What to reach for while a screen is still being decided.',
    artwork: { shape: 'ramp', seed: 14, tone: 'accent' },
    packages: [
      'com.lumen.contrast',
      'com.lumen.bezier',
      'com.lumen.words',
      'com.lumen.icons.studio',
      'com.lumen.icons.weather',
      'com.lumen.font.plex-italic',
    ],
  },
  {
    id: 'drawn-here',
    title: 'Drawn here',
    tagline: 'The faces and icon sets this catalogue made itself.',
    artwork: { shape: 'type', seed: 22, tone: 'neutral' },
    packages: [
      'com.lumen.font.seven',
      'com.lumen.font.blocks',
      'com.lumen.icons.weather',
      'com.lumen.icons.transit',
      'com.lumen.icons.studio',
    ],
  },
  {
    id: 'quiet-tools',
    title: 'Quiet tools',
    tagline: 'Small programs that do one thing and then get out of the way.',
    artwork: { shape: 'grid', seed: 36, tone: 'neutral' },
    packages: ['com.lumen.stopwatch', 'com.lumen.metronome', 'com.lumen.ids', 'com.lumen.cron'],
  },
];

/** The wide cards at the top of the storefront. */
export const BANNERS = [
  {
    id: 'welcome',
    title: 'Six programs to start with',
    text: 'A pattern tester, a diff, a table, an encoder, a stopwatch and a clock.',
    target: { kind: 'collection', id: 'essentials' },
    artwork: { shape: 'rings', seed: 3, tone: 'accent' },
  },
  {
    id: 'typefaces',
    title: 'Two italics and two faces drawn from rectangles',
    text: 'The italics the OS leaves out, a seven-segment display and a set of blocks.',
    target: { kind: 'section', id: 'typefaces' },
    artwork: { shape: 'type', seed: 22, tone: 'neutral' },
  },
  {
    id: 'developer-kit',
    title: 'The Developer Kit, in one install',
    text: 'Six tools and the monospace italic, downloaded together.',
    target: { kind: 'package', id: 'com.lumen.bundle.developer' },
    artwork: { shape: 'grid', seed: 81, tone: 'accent' },
  },
];

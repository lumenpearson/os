/**
 * Bundles install several packages at once and carry no payload of their own.
 *
 * A bundle is worth having only when its members are used together; three of
 * them is the whole set, because a catalogue of bundles that each repackage
 * the same twelve programs is a catalogue nobody can navigate.
 */

export const DEVELOPER_KIT = {
  id: 'com.lumen.bundle.developer',
  kind: 'bundle',
  name: 'Developer Kit',
  tagline: 'Six tools and a face for the parts of the day spent in a terminal.',
  version: '1.2.0',
  publisher: 'Lumen',
  category: 'bundles',
  price: 'free',
  keywords: ['bundle', 'developer', 'tools', 'terminal'],
  updated: '2026-09-03T09:00:00Z',
  description:
    'The six programs that answer the questions that interrupt a working day: ' +
    'what does this pattern match, what changed between these two files, what ' +
    'do these bytes say, when does this cron line fire, what identifier should ' +
    'this row get, and what time is this stamp.\n\n' +
    'The monospace italic comes with them, because every one of these tools ' +
    'prints values in the monospace face and half of them want a second voice ' +
    'inside it for a comment or a note.\n\n' +
    'Installing the bundle installs each member separately; removing the bundle ' +
    'leaves them in place, so nothing you have started using disappears because ' +
    'a bundle was tidied away.',
  releaseNotes: 'Added the Timestamp Converter.',
  requires: { os: '>=0.1.0' },
  capabilities: ['storage'],
  screenshots: [{ shape: 'grid', seed: 81, tone: 'accent' }],
  members: [
    'com.lumen.regex',
    'com.lumen.diff',
    'com.lumen.encoder',
    'com.lumen.cron',
    'com.lumen.ids',
    'com.lumen.timestamp',
    'com.lumen.font.mono-italic',
  ],
};

export const DESIGN_KIT = {
  id: 'com.lumen.bundle.design',
  kind: 'bundle',
  name: 'Design Kit',
  tagline: 'Contrast, easing, filler text, an italic and a set of icons.',
  version: '1.0.0',
  publisher: 'Lumen',
  category: 'bundles',
  price: 'free',
  keywords: ['bundle', 'design', 'colour', 'typography', 'icons'],
  updated: '2026-08-30T09:00:00Z',
  description:
    'Everything in this catalogue that is used while a screen is being drawn ' +
    'rather than while a program is being written: the contrast checker for ' +
    'deciding whether a pair of colours can be read, the bezier editor for ' +
    'shaping how something moves, and the word sampler for filling a layout ' +
    'with text that has the vocabulary of the real copy.\n\n' +
    'The interface italic and the studio icon set come with them. Both are the ' +
    'kind of thing you notice you need halfway through a mockup, when stopping ' +
    'to find one is the most expensive part of the afternoon.\n\n' +
    'Five packages, none of which needs a network after it is installed.',
  releaseNotes: 'First release.',
  requires: { os: '>=0.1.0' },
  capabilities: ['storage'],
  screenshots: [{ shape: 'ramp', seed: 84, tone: 'accent' }],
  members: [
    'com.lumen.contrast',
    'com.lumen.bezier',
    'com.lumen.words',
    'com.lumen.font.plex-italic',
    'com.lumen.icons.studio',
  ],
};

export const DESK_SET = {
  id: 'com.lumen.bundle.desk',
  kind: 'bundle',
  name: 'Desk Set',
  tagline: 'Time, rhythm, a table and two faces to read them in.',
  version: '1.1.0',
  publisher: 'Lumen',
  category: 'bundles',
  price: 'free',
  keywords: ['bundle', 'time', 'metronome', 'stopwatch', 'desk'],
  updated: '2026-08-28T09:00:00Z',
  description:
    'The things that sit at the edge of a desk rather than at the centre of the ' +
    'work: a stopwatch that records laps, a metronome that holds a tempo, and a ' +
    'table view for whatever delimited text has just landed in the clipboard.\n\n' +
    'Two drawn faces come with them. The seven-segment face sets the stopwatch ' +
    'and the metronome the way a physical one would be set; the block face gives ' +
    'a terminal the eighth blocks and box rules that meet exactly, which is what ' +
    'a sparkline in a status line needs.\n\n' +
    'Five packages, about a hundred and twenty kilobytes together.',
  releaseNotes: 'Added the block face.',
  requires: { os: '>=0.1.0' },
  capabilities: ['storage', 'audio'],
  screenshots: [
    { shape: 'rings', seed: 87, tone: 'neutral' },
    { shape: 'type', seed: 90, tone: 'accent' },
  ],
  members: [
    'com.lumen.stopwatch',
    'com.lumen.metronome',
    'com.lumen.csv',
    'com.lumen.font.seven',
    'com.lumen.font.blocks',
  ],
};

export const BUNDLES = [DEVELOPER_KIT, DESIGN_KIT, DESK_SET];

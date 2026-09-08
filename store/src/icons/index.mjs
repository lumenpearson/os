/**
 * Three icon sets, drawn for this catalogue.
 *
 * Every glyph is one path string on a 24 by 24 grid, meant to be stroked at 2
 * units with round caps and round joins and no fill — the weight the OS's own
 * icons are drawn at, so a set can be mixed with them without the seam showing.
 * Nothing is filled, so an icon inherits its colour from `currentColor`.
 *
 * Shapes keep to the 2 to 22 band, leaving a unit of air inside the box at
 * every edge, and circles are written as two half arcs, which is the shortest
 * exact way to say a circle in path data.
 */

export const WEATHER = {
  id: 'com.lumen.icons.weather',
  kind: 'icons',
  name: 'Weather Icons',
  tagline: 'Twelve marks for sky, water and temperature.',
  version: '1.1.0',
  publisher: 'Lumen',
  category: 'icons',
  price: 'free',
  keywords: ['icons', 'weather', 'forecast', 'sun', 'rain'],
  updated: '2026-08-18T09:00:00Z',
  description:
    'Sun, moon, cloud, rain, snow, wind, fog, storm, thermometer, umbrella, ' +
    'droplet and sunrise. The set is built around one cloud silhouette that ' +
    'every weather state reuses, so a forecast row reads as one family rather ' +
    'than twelve separate drawings.\n\n' +
    'Marks below the cloud — rain, snow — sit on the same baseline at the same ' +
    'spacing, which keeps a column of forecast tiles from shifting as the ' +
    'weather changes. Rays, drops and flakes are drawn as short strokes and ' +
    'points rather than as filled shapes, so they survive being set at 16 ' +
    'pixels.\n\n' +
    'Stroke at 2 units with round caps and joins on a 24 unit box.',
  releaseNotes: 'Added fog and sunrise. The cloud is now identical across every state.',
  requires: { os: '>=0.1.0' },
  capabilities: ['icons'],
  screenshots: [{ shape: 'rings', seed: 61, tone: 'neutral' }],
  payload: {
    prefix: 'weather',
    icons: {
      sun:
        'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4' +
        'M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
      moon: 'M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5 8.5 8.5 0 1 0 20.5 14.8z',
      cloud: 'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.8 3.8 0 0 1 17.5 18H7z',
      rain:
        'M7 15a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.8 3.8 0 0 1 17.5 15H7' +
        'M8 18v2.5M12 18v3.5M16 18v2.5',
      snow:
        'M7 14a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.8 3.8 0 0 1 17.5 14H7' +
        'M8.5 18h.01M12 17h.01M15.5 18h.01M10 21h.01M14 21h.01',
      storm:
        'M7 14a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.8 3.8 0 0 1 17.5 14H7' +
        'M13.5 16.5 10 20h3.5L10.5 23',
      fog: 'M6.5 12a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.8 3.8 0 0 1 17 12H6.5' + 'M3 16h18M6 20h12',
      wind: 'M3 8h9a3 3 0 1 0-3-3M3 12h12.5a3 3 0 1 1-3 3M3 16h6.5a2.5 2.5 0 1 1-2.5 2.5',
      thermometer: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0M12 9.5v5.5',
      umbrella: 'M3 12a9 9 0 0 1 18 0zM12 12v6.5a2.5 2.5 0 0 0 5 0M12 3V1.5',
      droplet: 'M12 3.5 17 9.6a6.5 6.5 0 1 1-10 0z',
      sunrise:
        'M12 2v4M6.3 8.3 4.9 6.9M17.7 8.3l1.4-1.4M2 16h3M19 16h3' + 'M8 16a4 4 0 0 1 8 0M3 20h18',
    },
  },
};

export const TRANSIT = {
  id: 'com.lumen.icons.transit',
  kind: 'icons',
  name: 'Transit Icons',
  tagline: 'Thirteen ways of getting there.',
  version: '1.0.0',
  publisher: 'Lumen',
  category: 'icons',
  price: 'free',
  keywords: ['icons', 'transport', 'travel', 'map', 'journey'],
  updated: '2026-08-11T09:00:00Z',
  description:
    'Bus, train, tram, bicycle, ferry, plane, walking, car, scooter, traffic ' +
    'light, map pin, signpost and route. Drawn for a journey planner, where the ' +
    'icon has to be told apart from its neighbour at the size of a list row.\n\n' +
    'The three rail-and-road vehicles share a body, a window line and a pair of ' +
    'lamps, and differ only where they actually differ: the tram takes a ' +
    'pantograph, the train takes rails, the bus takes a door. Wheels are open ' +
    'circles of the same radius throughout, so a row of them sits on one line.\n\n' +
    'Stroke at 2 units with round caps and joins on a 24 unit box.',
  releaseNotes: 'First release.',
  requires: { os: '>=0.1.0' },
  capabilities: ['icons'],
  screenshots: [{ shape: 'grid', seed: 64, tone: 'accent' }],
  payload: {
    prefix: 'transit',
    icons: {
      bus:
        'M6 4h12a2 2 0 0 1 2 2v11H4V6a2 2 0 0 1 2-2zM4 11h16' +
        'M7 17v3M17 17v3M8.5 14h.01M15.5 14h.01',
      train:
        'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z' +
        'M4 10h16M8.5 14h.01M15.5 14h.01M8 18l-3 3M16 18l3 3',
      tram:
        'M8 4h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z' +
        'M5 10h14M12 4V2M8 21l1.5-3M16 21l-1.5-3M9.5 14h.01M14.5 14h.01',
      bicycle:
        'M6.5 20.5a4 4 0 1 0 0-8 4 4 0 1 0 0 8M17.5 20.5a4 4 0 1 0 0-8 4 4 0 1 0 0 8' +
        'M6.5 16.5 11 8h5l1.5 8.5M9 8h4.5M14 5h2.5',
      ferry:
        'M3 18.5c1.5 0 2-1.2 3.5-1.2s2 1.2 3.5 1.2 2-1.2 3.5-1.2 2 1.2 3.5 1.2' +
        'M5.5 14 7 9.5h10L18.5 14M9 9.5V6h6M12 6V3.5',
      plane: 'M21 3 3 10.5l7 3 3 7zM10 13.5 21 3',
      walk:
        'M13.5 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 1 0 0 3M12.5 7 9 8.5V12' +
        'M12.5 7l2.5 3 3 1M12.5 7l-1.5 7 3 2.5.5 5M11 14l-2 3-1 4.5',
      car:
        'M3.5 13.5 5.5 8h13l2 5.5V17h-2.5M8 17H3.5v-3.5M3.5 13.5h17' +
        'M7 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 1 0 0 5' +
        'M17 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 1 0 0 5',
      scooter:
        'M6 19.5a3 3 0 1 0 0-6 3 3 0 1 0 0 6M18 19.5a3 3 0 1 0 0-6 3 3 0 1 0 0 6' +
        'M9 16.5h6M15.5 16.5 13.5 6H10M13.5 6H18M6 13.5V9h4',
      traffic:
        'M9 2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z' +
        'M12 6.5h.01M12 11h.01M12 15.5h.01M17 6h3M17 11h3M4 6h3M4 11h3',
      pin: 'M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 1 0 0 5',
      signpost: 'M12 2v20M12 5h7l2.5 2.5L19 10h-7M12 13H5l-2.5 2.5L5 18h7',
      route:
        'M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 1 0 0 5M18 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 1 0 0 5' +
        'M6 8v3a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v1',
    },
  },
};

export const STUDIO = {
  id: 'com.lumen.icons.studio',
  kind: 'icons',
  name: 'Studio Icons',
  tagline: 'Twelve marks for recording, mixing and playing back.',
  version: '1.0.2',
  publisher: 'Lumen',
  category: 'icons',
  price: 'free',
  keywords: ['icons', 'audio', 'video', 'media', 'studio'],
  updated: '2026-08-23T09:00:00Z',
  description:
    'Camera, microphone, film, waveform, faders, headphones, speaker, clapper, ' +
    'aperture, disc, playlist and metronome. A set for the parts of an ' +
    'interface that record and play things back.\n\n' +
    'The waveform and the faders stand on the same x positions — 3, 11 and 19 — ' +
    'so a transport bar reads as one control rather than as a row of unrelated ' +
    'glyphs, and the aperture and the disc share a nine unit radius, which keeps ' +
    'them the same optical size beside each other.\n\n' +
    'Stroke at 2 units with round caps and joins on a 24 unit box.',
  releaseNotes: 'The waveform and faders now share their stem positions.',
  requires: { os: '>=0.1.0' },
  capabilities: ['icons'],
  screenshots: [
    { shape: 'ramp', seed: 67, tone: 'neutral' },
    { shape: 'rings', seed: 71, tone: 'accent' },
  ],
  payload: {
    prefix: 'studio',
    icons: {
      camera:
        'M4 7h3l1.5-2.5h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z' +
        'M12 17.5a4 4 0 1 0 0-8 4 4 0 1 0 0 8',
      microphone:
        'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0' +
        'M12 17v4M9 21h6',
      film: 'M3 4h18v16H3zM3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4M7 4v16M17 4v16',
      waveform: 'M3 10.5v3M7 7v10M11 3.5v17M15 8v8M19 10.5v3',
      faders: 'M3 21v-6M3 11V3M11 21v-9M11 8V3M19 21v-4M19 13V3' + 'M1 13h4M9 10h4M17 15h4',
      headphones:
        'M4 17v-5a8 8 0 1 1 16 0v5M4 14h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z' +
        'M20 14h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1z',
      speaker: 'M11 5 6 9.5H3v5h3l5 4.5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
      clapper:
        'M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3.5 9 2.6 5.1l17-3.1.9 4' +
        'M8.5 3.7 9.4 7.8M14 2.7l.9 4.1',
      aperture: 'M12 21a9 9 0 1 0 0-18 9 9 0 1 0 0 18M12 12h9M12 12 7.5 4.2M12 12l-4.5 7.8',
      disc: 'M12 21a9 9 0 1 0 0-18 9 9 0 1 0 0 18M12 14a2 2 0 1 0 0-4 2 2 0 1 0 0 4',
      playlist: 'M3 6h11M3 11h11M3 16h7M19 6v9.5M19 6l-3 .8M17 19a2 2 0 1 0 0-4 2 2 0 1 0 0 4',
      metronome: 'M12 3 7 20h10zM4.5 20h15M9.2 12h5.6M12 3v9',
    },
  },
};

export const ICON_SETS = [WEATHER, TRANSIT, STUDIO];

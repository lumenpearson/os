import { Ruler } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A converter across fourteen kinds of quantity. Temperature is affine and
 * fuel economy is reciprocal, so both are converted as what they are rather
 * than as factors; the units that differ by country — the US and imperial
 * gallon, pint and ton — are separate entries, never one guessed default.
 */
export default defineApp({
  id: 'lumen.units',
  name: 'Units',
  description: 'Convert length, mass, temperature, data and ten other kinds of quantity.',
  category: 'utilities',
  icon: createAppIcon({ glyph: Ruler, tone: 'graphite' }),
  component: lazy(() => import('./Units')),
  window: { width: 620, height: 560, minWidth: 320, minHeight: 300, titleBar: 'inset' },
  singleton: true,
  keywords: ['convert', 'converter', 'measure', 'metric', 'imperial', 'temperature'],
});

import { Pipette } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A colour tool with nothing to fetch: hex, rgb, hsl and oklch are four
 * spellings of one number, WCAG contrast is arithmetic on it, and dichromat
 * simulation is a matrix. The palette is the only thing that persists, and it
 * goes in the user's home so it belongs to the account.
 */
export default defineApp({
  id: 'lumen.colour',
  name: 'Colour',
  description:
    'Pick a colour, read it as hex, rgb, hsl or oklch, and check its contrast and colour-blind legibility.',
  category: 'utilities',
  icon: createAppIcon({ glyph: Pipette, tone: 'violet' }),
  component: lazy(() => import('./Colour')),
  window: { width: 900, height: 640, minWidth: 380, minHeight: 420, titleBar: 'inset' },
  singleton: true,
  keywords: ['color', 'colour', 'picker', 'hex', 'rgb', 'hsl', 'oklch', 'contrast', 'wcag'],
});

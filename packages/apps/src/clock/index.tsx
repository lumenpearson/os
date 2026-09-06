import { Clock } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The time, in the four shapes it is usually wanted: the local clock, other
 * cities against it, a stopwatch with laps, and a countdown. Every reading is
 * derived from a timestamp, so nothing here drifts while the window is hidden.
 */
export default defineApp({
  id: 'lumen.clock',
  name: 'Clock',
  description: 'Local and world time, a stopwatch with laps, and a countdown timer.',
  category: 'utilities',
  icon: createAppIcon({ glyph: Clock, tone: 'graphite' }),
  component: lazy(() => import('./Clock')),
  window: { width: 560, height: 420, minWidth: 300, minHeight: 260 },
  singleton: true,
  keywords: ['time', 'timer', 'stopwatch', 'alarm', 'world', 'countdown'],
});

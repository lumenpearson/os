import { Grid2x2 } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * 2048 on the classic rules: slide the grid, equal tiles merge once per move,
 * a tile appears after every move that changed something. The game in progress
 * and the best score are kept under the user's home, and one move can be taken
 * back.
 */
export default defineApp({
  id: 'lumen.2048',
  name: '2048',
  description: 'Slide the tiles together until one of them reads 2048.',
  category: 'games',
  icon: createAppIcon({ glyph: Grid2x2, tone: 'amber' }),
  component: lazy(() => import('./Twenty48')),
  window: { width: 460, height: 620, minWidth: 320, minHeight: 440 },
  singleton: true,
  keywords: ['2048', 'game', 'puzzle', 'tiles', 'slide', 'merge'],
});

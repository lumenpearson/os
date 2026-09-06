import { Bomb } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Minesweeper on the classic rules, with the first click and its eight
 * neighbours guaranteed clear so every game opens a region. Mouse and
 * keyboard reach everything, chording included.
 */
export default defineApp({
  id: 'lumen.minesweeper',
  name: 'Minesweeper',
  description: 'Clear the field without uncovering a mine.',
  category: 'games',
  icon: createAppIcon({ glyph: Bomb, tone: 'red' }),
  component: lazy(() => import('./Minesweeper')),
  window: { width: 560, height: 620, minWidth: 300, minHeight: 360 },
  singleton: true,
  keywords: ['game', 'mines', 'puzzle', 'sweeper'],
});

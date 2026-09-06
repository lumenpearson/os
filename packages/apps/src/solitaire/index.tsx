import { Spade } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Klondike, one card or three, with the deal in progress kept under the user's
 * home so a game can be put down and picked up. Every rule is tested against
 * the table rather than the screen.
 */
export default defineApp({
  id: 'lumen.solitaire',
  name: 'Solitaire',
  description: 'Klondike, one card or three, with undo and a clock.',
  category: 'games',
  icon: createAppIcon({ glyph: Spade, tone: 'green' }),
  component: lazy(() => import('./Solitaire')),
  window: { width: 900, height: 680, minWidth: 460, minHeight: 420, titleBar: 'inset' },
  singleton: true,
  keywords: ['solitaire', 'klondike', 'cards', 'patience', 'game'],
});

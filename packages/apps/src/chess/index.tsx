import { Crown } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Chess with the complete rules — castling, en passant, promotion, the draws
 * — verified against the published perft counts, and an opponent that searches
 * with alpha-beta and hands the window back between iterations so it never
 * freezes while it thinks.
 */
export default defineApp({
  id: 'lumen.chess',
  name: 'Chess',
  description: 'Play chess against the computer, at four strengths.',
  category: 'games',
  icon: createAppIcon({ glyph: Crown, tone: 'ink' }),
  component: lazy(() => import('./Chess')),
  window: { width: 900, height: 700, minWidth: 380, minHeight: 420 },
  keywords: ['chess', 'game', 'board', 'engine', 'pgn', 'fen'],
});

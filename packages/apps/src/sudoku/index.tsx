import { Grid3x3 } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Sudoku with puzzles generated on the spot rather than shipped in a list:
 * a board is dealt from a seed, then carved down while it still has exactly
 * one solution, and graded by how far plain deduction gets before a guess is
 * needed.
 */
export default defineApp({
  id: 'lumen.sudoku',
  name: 'Sudoku',
  description: 'Generated puzzles at four grades, with pencil marks and hints.',
  category: 'games',
  icon: createAppIcon({ glyph: Grid3x3, tone: 'blue' }),
  component: lazy(() => import('./Sudoku')),
  window: { width: 620, height: 720, minWidth: 340, minHeight: 460, titleBar: 'inset' },
  singleton: true,
  keywords: ['sudoku', 'game', 'puzzle', 'numbers', 'grid', 'logic'],
});

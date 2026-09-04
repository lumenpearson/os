import { Calculator } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Arithmetic in three shapes: a basic keypad, a scientific one with the
 * functions and an angle unit, and a programmer one working on words of 8 to
 * 64 bits in hex, decimal, octal and binary. Typing is the first input path.
 */
export default defineApp({
  id: 'lumen.calculator',
  name: 'Calculator',
  description: 'Basic, scientific and programmer arithmetic with a running tape.',
  category: 'utilities',
  icon: createAppIcon({ glyph: Calculator, tone: 'graphite' }),
  component: lazy(() => import('./Calculator')),
  window: { width: 320, height: 480, minWidth: 260, minHeight: 380 },
  singleton: true,
  keywords: ['math', 'calc', 'convert', 'programmer', 'arithmetic'],
});

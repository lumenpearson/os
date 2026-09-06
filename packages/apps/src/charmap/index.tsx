import { Type } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A grid of characters by Unicode block, searchable by code point, with the
 * encodings and escapes for whichever one is under the cursor. There is no
 * character database in the system, so the app shows only what it can derive
 * or vouch for: code points whose names it cannot state are shown without a
 * name rather than with a guess.
 */
export default defineApp({
  id: 'lumen.charmap',
  name: 'Character Map',
  description: 'Find a character by Unicode block or code point and copy it to the clipboard.',
  category: 'utilities',
  icon: createAppIcon({ glyph: Type, tone: 'graphite' }),
  component: lazy(() => import('./CharacterMap')),
  window: { width: 900, height: 620, minWidth: 380, minHeight: 340, titleBar: 'inset' },
  singleton: true,
  keywords: [
    'character',
    'unicode',
    'glyph',
    'symbol',
    'emdash',
    'accent',
    'entity',
    'code point',
    'utf-8',
  ],
});

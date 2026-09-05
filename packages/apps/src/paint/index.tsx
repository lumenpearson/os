import { Paintbrush } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A bitmap editor: pencil, brush, eraser, bucket, shapes, text and a
 * rectangular selection, with whole-image undo and a pixel grid at high zoom.
 * Pictures are saved as PNG.
 */
export default defineApp({
  id: 'lumen.paint',
  name: 'Paint',
  description: 'Draw and edit pictures pixel by pixel.',
  category: 'media',
  icon: createAppIcon({ glyph: Paintbrush, tone: 'graphite' }),
  component: lazy(() => import('./Paint')),
  window: { width: 980, height: 700, minWidth: 480, minHeight: 380, titleBar: 'inset' },
  // Below Preview, which stays what a double-click opens: opening a photo to
  // look at it is the common case, and editing it is the deliberate one.
  fileAssociations: [
    { extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'], role: 'editor', priority: 1 },
  ],
  keywords: ['paint', 'draw', 'image', 'editor', 'bitmap', 'pixels', 'png'],
});

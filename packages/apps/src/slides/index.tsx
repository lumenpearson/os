import { Presentation } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Presentations stored as `.lsl` (JSON). Launch with `{ path }` to open a
 * deck; without arguments it starts on an untitled one.
 */
export default defineApp({
  id: 'lumen.slides',
  name: 'Slides',
  description: 'Presentations with layouts, notes and a full-screen player.',
  category: 'office',
  icon: createAppIcon({ glyph: Presentation, tone: 'amber' }),
  component: lazy(() => import('./Slides')),
  window: { width: 1000, height: 660, minWidth: 520, minHeight: 360, titleBar: 'inset' },
  fileAssociations: [{ extensions: ['.lsl'], role: 'editor', priority: 2 }],
  keywords: ['presentation', 'powerpoint', 'keynote', 'deck'],
});

export type SlidesArgs = { path?: string };

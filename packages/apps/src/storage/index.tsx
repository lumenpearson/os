import { HardDrive } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Where the space went: what the file system reports, what the files add up
 * to by category, a treemap of the home folder, and the largest files with
 * somewhere to put them. Singleton, because one scan of the tree is enough.
 */
export default defineApp({
  id: 'lumen.storage',
  name: 'Storage',
  description: 'See what is using disk space and clear it out.',
  category: 'system',
  icon: createAppIcon({ glyph: HardDrive, tone: 'graphite' }),
  component: lazy(() => import('./Storage')),
  window: { width: 880, height: 620, minWidth: 400, minHeight: 320 },
  singleton: true,
  keywords: ['disk', 'space', 'usage', 'cleanup', 'size', 'files'],
});

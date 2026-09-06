import { Archive } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * ZIP archives, read and written inside the file system: open one to see what
 * is in it and take files out, or pick files and folders to build a new one.
 * Launch with `{ path }` to open an archive straight away.
 */
export default defineApp({
  id: 'lumen.archive',
  name: 'Archive Utility',
  description: 'Open and create ZIP archives.',
  category: 'utilities',
  icon: createAppIcon({ glyph: Archive, tone: 'green' }),
  component: lazy(() => import('./Archive')),
  window: { width: 820, height: 560, minWidth: 380, minHeight: 300, titleBar: 'inset' },
  fileAssociations: [{ extensions: ['.zip'], role: 'editor', priority: 1 }],
  keywords: ['zip', 'archive', 'compress', 'extract', 'unzip'],
});

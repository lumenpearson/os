import { Folder } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The file explorer: browse, organise, rename, move and open everything in
 * the VFS. Launch with `{ path }` to open a folder (or a file's folder with
 * the file selected); without it the window opens Settings → Files → home.
 */
export default defineApp({
  id: 'lumen.files',
  name: 'Files',
  description: 'Browse, organise and open your files.',
  category: 'system',
  icon: createAppIcon({ glyph: Folder, tone: 'blue' }),
  component: lazy(() => import('./Files')),
  window: { width: 920, height: 580, minWidth: 480, minHeight: 320, titleBar: 'inset' },
  acceptsDirectories: true,
  pinnedByDefault: true,
  keywords: ['explorer', 'finder', 'folders'],
});

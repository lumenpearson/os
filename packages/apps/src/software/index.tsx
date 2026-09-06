import { Package } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The manager for pseudo-programs: the `.app` manifests the OS installs under
 * /Applications and runs through `lumen.webapp`, the Terminal, or an alias to
 * a built-in app. Draws the store its address in Settings points at — banners,
 * shelves and collections, with the programs bundled in the OS folded into the
 * same list — installs a package after checking its length and its digest,
 * lists everything registered, and installs from a file, a drop or pasted JSON
 * after validating it. Launch with `{ section }` to open at "store",
 * "installed" or "install".
 */
export default defineApp({
  id: 'lumen.software',
  name: 'Software Center',
  description: 'Install, inspect and remove apps and pseudo-programs.',
  category: 'system',
  icon: createAppIcon({ glyph: Package, tone: 'blue' }),
  component: lazy(() => import('./Software')),
  window: { width: 900, height: 640, minWidth: 420, minHeight: 320 },
  singleton: true,
  keywords: ['install', 'apps', 'packages', 'store', 'manifest', 'uninstall', 'fonts', 'icons'],
});

export type SoftwareArgs = { section?: 'store' | 'installed' | 'install' };

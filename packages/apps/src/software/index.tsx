import { Package } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The manager for pseudo-programs: the `.app` manifests the OS installs under
 * /Applications and runs through `lumen.webapp`, the Terminal, or an alias to
 * a built-in app. Lists everything registered, installs from a file, a drop
 * or pasted JSON after validating it, and carries a small catalogue of
 * programs bundled with the system. Launch with `{ section }` to open at
 * "installed", "install" or "catalogue".
 */
export default defineApp({
  id: 'lumen.software',
  name: 'Software Center',
  description: 'Install, inspect and remove apps and pseudo-programs.',
  category: 'system',
  icon: createAppIcon({ glyph: Package, tone: 'blue' }),
  component: lazy(() => import('./Software')),
  window: { width: 900, height: 640, minWidth: 400, minHeight: 320 },
  singleton: true,
  keywords: ['install', 'apps', 'packages', 'store', 'manifest', 'uninstall'],
});

export type SoftwareArgs = { section?: 'installed' | 'install' | 'catalogue' };

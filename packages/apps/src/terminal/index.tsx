import { TerminalSquare } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A shell over the VFS. `.app` manifests with a `script` field launch here
 * with `{ script, title }`; Files opens a folder here with `{ path }`.
 */
export default defineApp({
  id: 'lumen.terminal',
  name: 'Terminal',
  description: 'A shell over the file system with the usual commands.',
  category: 'developer',
  icon: createAppIcon({ glyph: TerminalSquare, tone: 'ink' }),
  component: lazy(() => import('./Terminal')),
  window: { width: 760, height: 460, minWidth: 360, minHeight: 200 },
  acceptsDirectories: true,
  pinnedByDefault: true,
  keywords: ['shell', 'console', 'command line', 'cli'],
});

export interface TerminalArgs {
  /** Directory the shell starts in. */
  cwd?: string;
  /** Treated as `cwd` when it is a directory. */
  path?: string;
  /** Lumen shell script run at start. */
  script?: string;
  /** Window title override (used by script pseudo-programs). */
  title?: string;
}

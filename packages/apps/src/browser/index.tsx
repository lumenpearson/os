import { Globe } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The web, in sandboxed frames. Tabs, bookmarks and history are the app's
 * own; the pages behind `lumen://` are React, not HTML strings. Launch with
 * `{ url }` to open an address in a new tab.
 */
export default defineApp({
  id: 'lumen.browser',
  name: 'Browser',
  description: 'Tabbed web browsing with bookmarks, history and a sandboxed page frame.',
  category: 'internet',
  icon: createAppIcon({ glyph: Globe, tone: 'blue' }),
  component: lazy(() => import('./Browser')),
  window: { width: 1000, height: 700, minWidth: 420, minHeight: 320, titleBar: 'inset' },
  pinnedByDefault: true,
  keywords: ['web', 'internet', 'url', 'browse'],
});

/** `url` opens an address in a new tab of an already running window. */
export type BrowserArgs = { url?: string };

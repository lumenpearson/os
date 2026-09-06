import { ClipboardList } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The kernel has always kept the last things Lumen copied and nothing has
 * ever shown them. This window is that list: click an item to put it back on
 * the clipboard, pin the ones worth keeping past the end of the ring, and
 * remove the rest.
 */
export default defineApp({
  id: 'lumen.clipboard',
  name: 'Clipboard',
  description: 'Show what Lumen has copied and put any of it back on the clipboard.',
  category: 'utilities',
  icon: createAppIcon({ glyph: ClipboardList, tone: 'teal' }),
  component: lazy(() => import('./Clipboard')),
  window: { width: 760, height: 520, minWidth: 380, minHeight: 320, titleBar: 'inset' },
  singleton: true,
  keywords: ['clipboard', 'history', 'copy', 'paste', 'pin', 'snippet'],
});

import { ScrollText } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The system log. It reads the kernel's event bus, the notification store,
 * uncaught errors and rejections, and patches `console.*` only while a window
 * is open — the originals are restored on unmount, and the original call is
 * always made.
 */
export default defineApp({
  id: 'lumen.console',
  name: 'Console',
  description: 'Read the system log: kernel events, notifications and errors.',
  category: 'developer',
  icon: createAppIcon({ glyph: ScrollText, tone: 'graphite' }),
  component: lazy(() => import('./Console')),
  window: { width: 900, height: 600, minWidth: 400, minHeight: 280 },
  singleton: true,
  keywords: ['log', 'logs', 'debug', 'events', 'diagnostics', 'errors'],
});

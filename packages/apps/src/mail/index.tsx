import { Mail } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * A mail client for a mailbox that lives in this computer's file system.
 * There is no account and no server: Send files a copy in Sent and delivers
 * another to Inbox, because the only address here is the loopback one.
 */
export default defineApp({
  id: 'lumen.mail',
  name: 'Mail',
  description: 'Read and write mail in a mailbox on this computer.',
  category: 'internet',
  icon: createAppIcon({ glyph: Mail, tone: 'blue' }),
  component: lazy(() => import('./Mail')),
  window: { width: 1040, height: 700, minWidth: 420, minHeight: 340, titleBar: 'inset' },
  singleton: true,
  keywords: ['mail', 'inbox', 'message', 'compose', 'draft'],
});

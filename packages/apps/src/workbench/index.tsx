import { Wrench } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Workbench: JSON, regular expressions, diffs, encodings, identifiers,
 * timestamps and hashes, one pane each. Everything runs in the window —
 * nothing is sent anywhere.
 */
export default defineApp({
  id: 'lumen.workbench',
  name: 'Workbench',
  description: 'Developer tools: JSON, regex, diff, encoding, IDs, time and hashes.',
  category: 'developer',
  icon: createAppIcon({ glyph: Wrench, tone: 'ink' }),
  component: lazy(() => import('./Workbench')),
  window: { width: 960, height: 680, minWidth: 400, minHeight: 320 },
  singleton: true,
  keywords: [
    'json',
    'regex',
    'diff',
    'base64',
    'url',
    'hex',
    'uuid',
    'ulid',
    'epoch',
    'timestamp',
    'sha',
    'hash',
    'encode',
    'decode',
    'tools',
  ],
});

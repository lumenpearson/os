import type { AppManifest } from '@lumen/kernel';
import { AppWindow } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Host for HTML pseudo-programs: a `.app` manifest with an `html` field runs
 * here inside a sandboxed iframe (scripts allowed, no same-origin access).
 * The frame can talk to the OS through postMessage; see ./bridge.ts.
 */
export default defineApp({
  id: 'lumen.webapp',
  name: 'Web App',
  description: 'Runs HTML pseudo-programs in a sandbox.',
  category: 'system',
  hidden: true,
  icon: createAppIcon({ glyph: AppWindow, tone: 'graphite' }),
  component: lazy(() => import('./WebApp')),
  window: { width: 640, height: 480, minWidth: 240, minHeight: 160 },
});

export type WebAppArgs = { manifest?: AppManifest };

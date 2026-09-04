import { Cpu } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * The spec sheet for the machine Lumen OS is running on. Singleton: the
 * menubar's "About This Computer" launches it, and launching it again brings
 * the one window forward instead of taking the readings twice.
 */
export default defineApp({
  id: 'lumen.sysinfo',
  name: 'System Information',
  description: 'Hardware, software and storage readings for this computer.',
  category: 'system',
  icon: createAppIcon({ glyph: Cpu, tone: 'graphite' }),
  component: lazy(() => import('./SystemInfo')),
  window: { width: 780, height: 580, minWidth: 380, minHeight: 300 },
  singleton: true,
  keywords: ['about', 'system', 'hardware', 'version', 'specs', 'device'],
});

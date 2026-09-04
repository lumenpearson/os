import { Activity } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * What is running and what it costs. Three views: the kernel's process table,
 * live charts of everything this platform can actually measure, and the app
 * registry. A reading the host cannot report is printed as an em-dash with
 * the reason beside it, never as a stand-in number.
 */
export default defineApp({
  id: 'lumen.taskmanager',
  name: 'Task Manager',
  description: 'Running processes, measured performance, and every registered app.',
  category: 'system',
  icon: createAppIcon({ glyph: Activity, tone: 'graphite' }),
  component: lazy(() => import('./TaskManager')),
  window: { width: 860, height: 600, minWidth: 420, minHeight: 300 },
  singleton: true,
  keywords: ['processes', 'performance', 'memory', 'cpu', 'activity', 'monitor'],
});

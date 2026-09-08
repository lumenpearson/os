import { Settings2 } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

export type { SectionId, SettingsSection } from './sections';
export { SETTINGS_SECTIONS } from './sections';

/**
 * System preferences. Singleton: launching it again with `{ section }` moves
 * the open window to that section (see SETTINGS_SECTIONS for the ids).
 */
export default defineApp({
  id: 'lumen.settings',
  name: 'Settings',
  description: 'System preferences: appearance, desktop, security, devices.',
  category: 'system',
  icon: createAppIcon({ glyph: Settings2, tone: 'graphite' }),
  component: lazy(() => import('./Settings')),
  window: { width: 860, height: 600, minWidth: 560, minHeight: 400 },
  singleton: true,
  pinnedByDefault: true,
  keywords: ['preferences', 'options', 'control panel', 'system'],
});

export type SettingsArgs = { section?: string };

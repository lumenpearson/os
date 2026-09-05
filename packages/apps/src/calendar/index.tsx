import { CalendarDays } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Month, week, day and agenda over one list of events. A repeating event is
 * stored as a rule rather than as copies, so moving or deleting one instance
 * writes an exception and leaves the series editable as a whole.
 */
export default defineApp({
  id: 'lumen.calendar',
  name: 'Calendar',
  description: 'Keep a calendar: month, week, day and agenda, with repeating events.',
  category: 'office',
  icon: createAppIcon({ glyph: CalendarDays, tone: 'graphite' }),
  component: lazy(() => import('./Calendar')),
  window: { width: 1000, height: 680, minWidth: 420, minHeight: 360 },
  singleton: true,
  keywords: ['calendar', 'events', 'schedule', 'agenda', 'appointments', 'month', 'week'],
});

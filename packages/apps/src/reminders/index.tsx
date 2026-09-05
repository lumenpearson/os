import { ListChecks } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Lists of things to do, kept in one file under the user's home. A due date
 * can be typed into the title — "pay rent on 1 Oct", "standup every week" —
 * and a reminder that repeats opens its next occurrence as it is ticked off.
 */
export default defineApp({
  id: 'lumen.reminders',
  name: 'Reminders',
  description: 'Lists of things to do, with due dates, priorities and subtasks.',
  category: 'office',
  icon: createAppIcon({ glyph: ListChecks, tone: 'amber' }),
  component: lazy(() => import('./Reminders')),
  window: { width: 880, height: 640, minWidth: 360, minHeight: 320 },
  singleton: true,
  keywords: ['reminders', 'todo', 'tasks', 'checklist', 'due', 'lists'],
});

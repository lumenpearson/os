import { NotebookPen } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Markdown notes kept as ordinary `.md` files in ~/Documents/Notes, so Files
 * and the Text Editor see the same documents. Launch with `{ path }` to open
 * one note.
 */
export default defineApp({
  id: 'lumen.notes',
  name: 'Notes',
  description: 'Markdown notes with tags, search, preview and task lists.',
  category: 'office',
  icon: createAppIcon({ glyph: NotebookPen, tone: 'amber' }),
  component: lazy(() => import('./Notes')),
  window: { width: 900, height: 620, minWidth: 380, minHeight: 300, titleBar: 'inset' },
  pinnedByDefault: true,
  keywords: ['note', 'markdown', 'write', 'todo', 'journal'],
});

export type NotesArgs = { path?: string };

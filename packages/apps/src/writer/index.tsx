import { PenLine } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

export default defineApp({
  id: 'lumen.writer',
  name: 'Writer',
  description: 'Rich text documents: headings, lists, links, export to HTML and Markdown.',
  category: 'office',
  icon: createAppIcon({ glyph: PenLine, tone: 'blue' }),
  component: lazy(() => import('./Writer')),
  window: { width: 900, height: 640, minWidth: 420, minHeight: 300 },
  fileAssociations: [
    { extensions: ['.lwr'], role: 'editor', priority: 2 },
    { extensions: ['.html', '.htm'], role: 'editor', priority: 0 },
    { extensions: ['.rtf'], role: 'viewer', priority: 0 },
  ],
  keywords: ['word', 'document', 'rich text', 'office'],
});

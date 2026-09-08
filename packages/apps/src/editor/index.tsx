import { FileText } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Plain text and code. Opens anything text-like; `.md` files also get a
 * preview pane. Launch with `{ path }` to open a document.
 */
export default defineApp({
  id: 'lumen.editor',
  name: 'Text Editor',
  description: 'Plain text and code with line numbers, find and replace, Markdown preview.',
  category: 'utilities',
  icon: createAppIcon({ glyph: FileText, tone: 'graphite' }),
  component: lazy(() => import('./Editor')),
  window: { width: 780, height: 540, minWidth: 360, minHeight: 240 },
  fileAssociations: [
    {
      extensions: [
        '.txt',
        '.md',
        '.markdown',
        '.log',
        '.json',
        '.csv',
        '.tsv',
        '.xml',
        '.yaml',
        '.yml',
        '.toml',
        '.ini',
        '.js',
        '.mjs',
        '.ts',
        '.tsx',
        '.jsx',
        '.css',
        '.html',
        '.htm',
        '.rs',
        '.py',
        '.go',
        '.c',
        '.h',
        '.cpp',
        '.java',
        '.sh',
        '.lsh',
      ],
      role: 'editor',
      priority: 1,
    },
  ],
  keywords: ['notepad', 'text', 'code', 'markdown'],
});

export type EditorArgs = { path?: string };

import { Table2 } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * Sheets: a spreadsheet over the VFS. `.lsd` workbooks are JSON; `.csv` and
 * `.tsv` open as a single sheet and save back in the format they came from.
 * The formula engine lives in ./engine and is plain, tested TypeScript.
 */
export default defineApp({
  id: 'lumen.sheets',
  name: 'Sheets',
  description: 'Spreadsheets with formulas, ranges and CSV import.',
  category: 'office',
  icon: createAppIcon({ glyph: Table2, tone: 'green' }),
  component: lazy(() => import('./Sheets')),
  window: { width: 960, height: 620, minWidth: 480, minHeight: 300 },
  fileAssociations: [
    { extensions: ['.lsd'], role: 'editor', priority: 2 },
    { extensions: ['.csv', '.tsv'], role: 'editor', priority: 1 },
  ],
  keywords: ['spreadsheet', 'excel', 'table', 'formula'],
});

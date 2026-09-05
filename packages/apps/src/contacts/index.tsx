import { Users } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

/**
 * An address book: records, groups, search, and vCard import and export for
 * 3.0 and 4.0. The book lives in one JSON file under the home directory;
 * `.vcf` files are the exchange format, read and written in full.
 */
export default defineApp({
  id: 'lumen.contacts',
  name: 'Contacts',
  description: 'Keep an address book, with groups, search and vCard import and export.',
  category: 'office',
  icon: createAppIcon({ glyph: Users, tone: 'teal' }),
  component: lazy(() => import('./Contacts')),
  window: { width: 900, height: 640, minWidth: 380, minHeight: 320 },
  singleton: true,
  fileAssociations: [{ extensions: ['.vcf'], role: 'editor', priority: 1 }],
  keywords: ['contacts', 'address book', 'people', 'vcard', 'phone', 'email', 'groups'],
});

/** `path` imports a `.vcf` into the book and selects the first card in it. */
export type ContactsArgs = { path?: string };
